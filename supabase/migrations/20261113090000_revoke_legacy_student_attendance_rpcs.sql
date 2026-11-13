-- Disable legacy student attendance endpoints that do not validate GPS.
-- Student attendance must use student_mark_attendance_v4 exclusively.
REVOKE EXECUTE ON FUNCTION public.student_mark_attendance_v2(text, text, text)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.student_mark_attendance_v3(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
