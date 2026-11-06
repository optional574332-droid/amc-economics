-- Fix mark upserts to use the canonical logical key.
-- Draft marks remain available to the owning teacher through t_get_marks,
-- while direct API reads (including admin reports) expose published marks only.

BEGIN;

-- Refuse to change the uniqueness rule if the live data is already ambiguous.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.marks
    GROUP BY student_id, course_code, exam_type, session_year
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot migrate marks: duplicate student/course/exam/session_year rows exist';
  END IF;
END;
$$;

-- The old key included the text session/year labels and could conflict with
-- the canonical session_year key during an upsert.
ALTER TABLE public.marks
  DROP CONSTRAINT IF EXISTS marks_session_year_course_code_exam_type_student_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS marks_student_course_exam_sy_key
  ON public.marks (student_id, course_code, exam_type, session_year);

-- Make the canonical key the explicit ON CONFLICT target.
CREATE OR REPLACE FUNCTION public.t_save_mark(
  p_token text,
  p_year text,
  p_course_code text,
  p_exam_type text,
  p_student_id uuid,
  p_marks numeric,
  p_session_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_tid uuid := public._teacher_id_from_token(p_token);
  v_stu public.students%rowtype;
BEGIN
  IF v_tid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Login expired, please login again');
  END IF;

  IF p_marks IS NULL OR p_marks < 0 OR p_marks > 100 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Marks must be 0-100');
  END IF;

  IF NOT public.teacher_owns_course(v_tid, 'ALL', p_year, p_course_code) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'This course is not yours');
  END IF;

  SELECT *
    INTO v_stu
    FROM public.students
   WHERE id = p_student_id
     AND year = p_year
     AND session_year = p_session_year;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Student is not in this class/session_year');
  END IF;

  INSERT INTO public.marks (
    session, year, session_year, course_code, exam_type,
    student_id, marks, is_published, published_at, published_by, updated_by
  )
  VALUES (
    v_stu.session, p_year, p_session_year, p_course_code, p_exam_type,
    p_student_id, p_marks, false, NULL, NULL, v_tid
  )
  ON CONFLICT (student_id, course_code, exam_type, session_year)
  DO UPDATE SET
    session = EXCLUDED.session,
    year = EXCLUDED.year,
    marks = EXCLUDED.marks,
    is_published = false,
    published_at = NULL,
    published_by = NULL,
    updated_at = now(),
    updated_by = v_tid;

  RETURN jsonb_build_object('ok', true, 'draft', true);
END;
$function$;

-- Direct table reads (including admin report queries) must never expose drafts.
ALTER TABLE public.marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marks_read_published ON public.marks;
CREATE POLICY marks_read_published
  ON public.marks
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

COMMIT;
