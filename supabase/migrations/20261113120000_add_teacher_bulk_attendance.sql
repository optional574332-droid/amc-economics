-- Teacher Bulk Attendance support.
-- Safe by design: no historical attendance rows are backfilled, updated, or deleted.
-- Existing Individual Manual Entry keeps its current upsert behavior; only its source
-- metadata is updated when that workflow creates/overwrites a record.

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS attendance_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.attendance_records'::regclass
      AND conname = 'attendance_records_source_check'
  ) THEN
    ALTER TABLE public.attendance_records
      ADD CONSTRAINT attendance_records_source_check
      CHECK (attendance_source IS NULL OR attendance_source IN ('pin', 'manual', 'bulk'));
  END IF;
END
$$;

COMMENT ON COLUMN public.attendance_records.attendance_source IS
  'How this attendance record was first/last recorded: pin, manual, bulk; NULL means legacy/unknown.';

-- New PIN records are tagged without changing the existing PIN RPC.
-- Explicit values supplied by trusted database functions (manual/bulk) are preserved.
CREATE OR REPLACE FUNCTION public.set_attendance_source_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.attendance_source IS NULL THEN
    NEW.attendance_source := CASE
      WHEN NEW.marked_by IS NULL THEN 'pin'
      ELSE 'manual'
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_attendance_source_on_insert ON public.attendance_records;
CREATE TRIGGER trg_set_attendance_source_on_insert
BEFORE INSERT ON public.attendance_records
FOR EACH ROW
EXECUTE FUNCTION public.set_attendance_source_on_insert();

-- Keep the existing Individual Manual Entry contract and conflict behavior intact.
-- The only functional addition is the source metadata on insert/conflict update.
CREATE OR REPLACE FUNCTION public.t_manual_attendance(
  p_token text,
  p_session_id uuid,
  p_student_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_tid uuid := public._teacher_id_from_token(p_token);
  v_s record;
BEGIN
  IF v_tid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Login expired, please login again');
  END IF;

  IF p_status NOT IN ('present','absent','late','excused') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Invalid status');
  END IF;

  SELECT * INTO v_s
  FROM public.attendance_sessions
  WHERE id = p_session_id;

  IF NOT FOUND OR NOT (
    v_s.teacher_id = v_tid
    OR public.teacher_owns_course(v_tid, v_s.session, v_s.year, v_s.course_code)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'This session is not yours');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.students
    WHERE id = p_student_id
      AND year = v_s.year
      AND session_year = v_s.session_year
      AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Student is not in this class/session_year');
  END IF;

  INSERT INTO public.attendance_records
    (session_id, student_id, status, marked_by, attendance_source)
  VALUES
    (p_session_id, p_student_id, p_status, v_tid, 'manual')
  ON CONFLICT (session_id, student_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    marked_by = EXCLUDED.marked_by,
    updated_at = now(),
    updated_by = EXCLUDED.marked_by,
    attendance_source = 'manual';

  RETURN jsonb_build_object('ok', true);
END
$function$;

-- New INSERT-ONLY bulk RPC. Existing rows are never updated by this function.
CREATE OR REPLACE FUNCTION public.t_bulk_attendance(
  p_token text,
  p_session_id uuid,
  p_student_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_tid uuid := public._teacher_id_from_token(p_token);
  v_s record;
  v_requested integer;
  v_inserted integer := 0;
  v_skipped integer := 0;
BEGIN
  IF v_tid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Login expired, please login again');
  END IF;

  IF p_student_ids IS NULL OR cardinality(p_student_ids) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Select at least one student');
  END IF;

  IF cardinality(p_student_ids) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Maximum 500 students can be submitted at once');
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(p_student_ids) AS x(student_id) WHERE student_id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Invalid student selection');
  END IF;

  SELECT * INTO v_s
  FROM public.attendance_sessions
  WHERE id = p_session_id;

  IF NOT FOUND OR NOT (
    v_s.teacher_id = v_tid
    OR public.teacher_owns_course(v_tid, v_s.session, v_s.year, v_s.course_code)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'This session is not yours');
  END IF;

  SELECT count(DISTINCT student_id)
  INTO v_requested
  FROM unnest(p_student_ids) AS x(student_id);

  -- Validate the entire submitted selection before inserting anything.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT student_id
      FROM unnest(p_student_ids) AS x(student_id)
    ) requested
    LEFT JOIN public.students s
      ON s.id = requested.student_id
     AND s.year = v_s.year
     AND s.session_year = v_s.session_year
     AND s.status = 'active'
    WHERE s.id IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'One or more selected students are not active in this class/session year');
  END IF;

  INSERT INTO public.attendance_records
    (session_id, student_id, status, marked_by, attendance_source)
  SELECT
    p_session_id, requested.student_id, 'present', v_tid, 'bulk'
  FROM (
    SELECT DISTINCT student_id
    FROM unnest(p_student_ids) AS x(student_id)
  ) requested
  ON CONFLICT (session_id, student_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_skipped := v_requested - v_inserted;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'skipped_existing', v_skipped,
    'requested', v_requested
  );
END
$function$;

-- Teacher tokens are validated inside the function. Keep the RPC callable to the
-- same public/anonymous browser client roles used by the existing teacher workflow.
REVOKE ALL ON FUNCTION public.t_bulk_attendance(text, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.t_bulk_attendance(text, uuid, uuid[]) TO anon, authenticated;

-- Create/reuse a non-PIN session for teacher-assisted attendance.
-- It is deliberately inactive, so this workflow never exposes a new student PIN.
CREATE OR REPLACE FUNCTION public.t_get_or_create_bulk_session(
  p_token text,
  p_year text,
  p_course_code text,
  p_date date,
  p_session_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_tid uuid := public._teacher_id_from_token(p_token);
  v_session_id uuid;
  v_pin text;
BEGIN
  IF v_tid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Login expired, please login again');
  END IF;

  IF p_year IS NULL OR p_course_code IS NULL OR p_date IS NULL OR p_session_year IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Class, course, date and session year are required');
  END IF;

  IF NOT public.teacher_owns_course(v_tid, 'ALL', p_year, p_course_code) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'This course is not assigned to you');
  END IF;

  -- Serialize same-teacher/same-course/date creation to avoid duplicate sessions.
  PERFORM pg_advisory_xact_lock(hashtext(
    v_tid::text || '|' || p_year || '|' || p_course_code || '|' ||
    p_date::text || '|' || p_session_year::text
  ));

  SELECT id INTO v_session_id
  FROM public.attendance_sessions
  WHERE teacher_id = v_tid
    AND year = p_year
    AND course_code = p_course_code
    AND date = p_date
    AND session_year = p_session_year
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'session_id', v_session_id, 'created', false);
  END IF;

  v_pin := lpad(floor(random() * 10000)::int::text, 4, '0');

  INSERT INTO public.attendance_sessions
    (teacher_id, session, year, session_year, course_code, date, pin,
     is_active, expires_at, closed_at, closed_by)
  VALUES
    (v_tid, 'ALL', p_year, p_session_year, p_course_code, p_date, v_pin,
     false, now(), now(), v_tid)
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object('ok', true, 'session_id', v_session_id, 'created', true);
END
$function$;

REVOKE ALL ON FUNCTION public.t_get_or_create_bulk_session(text, text, text, date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.t_get_or_create_bulk_session(text, text, text, date, integer) TO anon, authenticated;

