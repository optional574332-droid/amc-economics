/* js/bulk-attendance.js — Teacher-assisted bulk attendance.
   Existing records are displayed as locked; this screen only submits new PRESENT rows. */

let bulkAttendanceRoster = [];
let bulkAttendanceExisting = {};
let bulkAttendanceSelected = new Set();
let bulkAttendanceContext = null;

async function renderTeacherBulkAttendance(el) {
  if (!currentTeacher) {
    el.innerHTML = '<p class="text-red-500 text-center py-6">Please login again.</p>';
    return;
  }

  const { data: myCourses, error } = await db
    .from('teacher_courses')
    .select('*')
    .eq('teacher_id', currentTeacher.id);

  if (error) {
    el.innerHTML = '<p class="text-red-500 text-center py-6">Could not load your assigned courses. Please retry.</p>';
    return;
  }

  await getCourseInfoMap();
  const today = typeof getBangladeshNow === 'function'
    ? getBangladeshNow().dateStr
    : new Date().toISOString().slice(0, 10);

  el.innerHTML = `
    <div class="space-y-4 rounded-2xl bg-gradient-to-br from-sky-50 via-white to-teal-50 dark:from-slate-900 dark:via-slate-800 dark:to-teal-950 p-3 sm:p-4">
      <div>
        <div class="flex items-center gap-3"><span class="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-800 to-teal-600 text-white text-xl shadow-md">☑</span><div><h3 class="text-lg font-extrabold text-slate-800 dark:text-white">Bulk Attendance</h3><p class="text-xs font-medium text-teal-700 dark:text-teal-300">Teacher-assisted attendance</p></div></div>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Select students who do not already have an attendance record for this class, course and date.</p>
      </div>
      <div class="bg-white/90 dark:bg-slate-800/90 border border-sky-100 dark:border-slate-600 p-4 rounded-2xl shadow-sm space-y-3">
        ${teacherPickerHtml('ba', 'baCourse', 'baSY')}
        <label class="block text-sm font-bold dark:text-gray-200">Class date</label>
        <input type="date" id="baDate" value="${attrEsc(today)}" class="w-full border-2 rounded-xl p-3 dark:bg-gray-600 dark:text-white dark:border-gray-500">
        <button onclick="loadBulkAttendanceList()" class="w-full bg-gradient-to-r from-blue-800 to-teal-600 hover:from-blue-900 hover:to-teal-700 text-white px-5 py-3 rounded-xl font-bold shadow-md btn-pop">📋 Load Student List</button>
      </div>
      <div id="bulkAttendanceArea"></div>
    </div>`;

  tpInit('ba', 'baCourse', 'baSY', dedupeCourses(myCourses));
  bulkAttendanceRoster = [];
  bulkAttendanceExisting = {};
  bulkAttendanceSelected = new Set();
  bulkAttendanceContext = null;
}

async function loadBulkAttendanceList() {
  const courseValue = document.getElementById('baCourse')?.value || '';
  const date = document.getElementById('baDate')?.value || '';
  const sessionYear = parseInt(document.getElementById('baSY')?.value || '', 10);
  const area = document.getElementById('bulkAttendanceArea');

  if (!area) return;
  if (!courseValue || !date || !sessionYear) return toastWarning('Select class, course, session year and date first');

  const [courseCode, year] = courseValue.split('|');
  if (!courseCode || !year) return toastWarning('Please select a valid course');

  bulkAttendanceRoster = [];
  bulkAttendanceExisting = {};
  bulkAttendanceSelected = new Set();
  bulkAttendanceContext = null;

  showGlobalLoader();
  area.innerHTML = '<p class="text-center py-5 text-gray-500">Loading student list…</p>';

  try {
    const students = await fetchAll((from, to) => db
      .from('students')
      .select('id, name, class_roll, reg_no, session, is_irregular, year, session_year')
      .eq('year', year)
      .eq('session_year', sessionYear)
      .eq('status', 'active')
      .range(from, to));

    if (!students.length) {
      area.innerHTML = '<p class="text-center py-6 text-gray-500">No active students found for this class/session year.</p>';
      return;
    }

    // Read every session for this exact class/course/date so PIN, Manual and
    // Bulk records are all locked, including sessions opened by another assigned teacher.
    const { data: sessions, error: sessionError } = await db.from('attendance_sessions')
      .select('id, teacher_id, created_at')
      .eq('year', year)
      .eq('course_code', courseCode)
      .eq('date', date)
      .eq('session_year', sessionYear)
      .order('created_at', { ascending: false });
    if (sessionError) throw sessionError;

    const sessionIds = (sessions || []).map(s => s.id);
    let records = [];
    if (sessionIds.length) {
      const result = await db.from('attendance_records')
        .select('student_id, attendance_source, marked_by, status')
        .in('session_id', sessionIds);
      if (result.error) throw result.error;
      records = result.data || [];
    }

    // Reuse the latest existing class/course/date session, regardless of
    // which assigned teacher opened it. This keeps one held-class session.
    const submitSession = (sessions || [])[0] || null;

    bulkAttendanceRoster = sortStudents(students);
    bulkAttendanceExisting = Object.fromEntries(records.map(r => [r.student_id, r]));
    bulkAttendanceSelected = new Set();
    bulkAttendanceContext = {
      year, courseCode, date, sessionYear, sessionId: submitSession?.id || null
    };

    renderBulkAttendanceRows();
  } catch (e) {
    console.error('Bulk attendance list error:', e);
    const message = /attendance_source|column .* does not exist|schema cache/i.test(e.message || '')
      ? 'Bulk Attendance-এর ডাটাবেজ Migration এখনো Preview/পরীক্ষার ডাটাবেজে প্রয়োগ করা হয়নি।'
      : (e.message || 'Could not load the student list.');
    area.innerHTML = `<div class="rounded-xl bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-300">${escapeHtml(message)}</div>`;
  } finally {
    hideGlobalLoader();
  }
}

function bulkAttendanceSourceLabel(record) {
  if (!record) return '';
  if (record.attendance_source === 'pin') return 'PIN';
  if (record.attendance_source === 'manual') return 'Manual';
  if (record.attendance_source === 'bulk') return 'Bulk';
  // Legacy rows predate attendance_source; the existing PIN RPC stores no marked_by,
  // while the teacher manual-entry RPC stores the teacher ID.
  if (record.marked_by == null) return 'PIN (legacy)';
  return 'Teacher entry (legacy)';
}

function renderBulkAttendanceRows() {
  const area = document.getElementById('bulkAttendanceArea');
  if (!area || !bulkAttendanceContext) return;

  const searchInput = document.getElementById('baSearch');
  const searchFocused = document.activeElement === searchInput;
  const searchCursor = searchFocused && searchInput ? searchInput.selectionStart : null;
  const query = banglaToEnglish((searchInput?.value || '').trim()).toLowerCase();
  const sortMode = document.getElementById('baSort')?.value || getSortMode();
  const sorted = [...bulkAttendanceRoster].sort((a, b) => sortMode === 'reg'
    ? (_cmpReg(a.reg_no, b.reg_no) || _cmpRoll(a.class_roll, b.class_roll))
    : (_cmpRoll(a.class_roll, b.class_roll) || _cmpReg(a.reg_no, b.reg_no)));

  const filtered = sorted.filter(s => {
    if (!query) return true;
    return [s.name, s.class_roll, s.reg_no].some(v => String(v || '').toLowerCase().includes(query));
  });

  const lockedCount = bulkAttendanceRoster.filter(s => !!bulkAttendanceExisting[s.id]).length;
  const selectedCount = bulkAttendanceSelected.size;
  const eligibleCount = Math.max(0, bulkAttendanceRoster.length - lockedCount);

  area.innerHTML = `
    <div class="space-y-3">
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-xl bg-gradient-to-br from-sky-100 to-blue-100 dark:from-slate-700 dark:to-slate-600 border border-sky-200 dark:border-slate-600 p-3 shadow-sm"><p class="text-xl font-bold num-display dark:text-white">${bulkAttendanceRoster.length}</p><p class="text-xs text-gray-500 dark:text-gray-300">Students</p></div>
        <div class="rounded-xl bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/30 border border-amber-200 dark:border-amber-800 p-3 shadow-sm"><p class="text-xl font-bold num-display text-amber-700 dark:text-amber-300">${lockedCount}</p><p class="text-xs text-amber-700 dark:text-amber-300">Already marked</p></div>
        <div class="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/30 border border-emerald-200 dark:border-emerald-800 p-3 shadow-sm"><p class="text-xl font-bold num-display text-emerald-700 dark:text-emerald-300">${selectedCount}</p><p class="text-xs text-emerald-700 dark:text-emerald-300">Selected</p></div>
      </div>
      <div class="flex flex-col sm:flex-row gap-2">
        <input id="baSearch" value="${attrEsc(query)}" oninput="renderBulkAttendanceRows()" placeholder="Search name / roll / registration" class="min-w-0 flex-1 border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600">
        <select id="baSort" onchange="renderBulkAttendanceRows()" class="border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          <option value="roll" ${sortMode === 'roll' ? 'selected' : ''}>Sort: Roll</option>
          <option value="reg" ${sortMode === 'reg' ? 'selected' : ''}>Sort: Registration</option>
        </select>
      </div>
      <div class="flex gap-2 flex-wrap">
        <button onclick="selectAllBulkEligible()" class="bg-gradient-to-r from-sky-100 to-cyan-100 dark:from-sky-900/50 dark:to-cyan-900/40 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-700 px-3 py-2 rounded-lg text-sm font-semibold">Select all eligible</button>
        <button onclick="clearBulkSelection()" class="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 px-3 py-2 rounded-lg text-sm font-semibold">Clear selection</button>
      </div>
      <div class="text-xs text-gray-500 dark:text-gray-400">আগে হাজিরা দেওয়া শিক্ষার্থীর চেকবক্স লক থাকবে। এখানে শুধু নতুন Present রেকর্ড যোগ হবে; পুরোনো রেকর্ড পরিবর্তন হবে না।</div>
      <div class="border dark:border-gray-600 rounded-xl overflow-hidden divide-y dark:divide-gray-600">
        ${filtered.map(s => {
          const existing = bulkAttendanceExisting[s.id];
          const checked = existing || bulkAttendanceSelected.has(s.id);
          const source = existing ? bulkAttendanceSourceLabel(existing) : '';
          return `
            <label class="flex items-center gap-3 p-3 ${existing ? 'bg-rose-50 dark:bg-rose-950/40 border-l-4 border-rose-300 dark:border-rose-700 opacity-80 cursor-not-allowed' : (bulkAttendanceSelected.has(s.id) ? 'bg-emerald-100 dark:bg-emerald-900/50 border-l-4 border-emerald-500 cursor-pointer' : 'bg-emerald-50 dark:bg-emerald-950/25 border-l-4 border-emerald-200 dark:border-emerald-800 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors')}">
              <input type="checkbox" ${checked ? 'checked' : ''} ${existing ? 'disabled' : ''} onchange="toggleBulkStudent('${attrEsc(s.id)}', this.checked)" class="w-5 h-5 accent-teal-600 shrink-0">
              <span class="min-w-0 flex-1">
                <span class="block font-semibold text-sm dark:text-white"><span class="num-display">${escapeHtml(s.class_roll || '-')}</span> — ${escapeHtml(s.name || '')}${s.is_irregular ? ' <span class="chip chip-none">Irregular</span>' : ''}</span>
                <span class="block text-xs text-gray-500 dark:text-gray-300">Reg: <span class="num-display">${escapeHtml(s.reg_no || '-')}</span></span>
              </span>
              ${existing ? `<span class="text-[11px] font-semibold text-rose-700 dark:text-rose-300 text-right">${escapeHtml(source)}<br>Already marked</span>` : ''}
            </label>`;
        }).join('')}
      </div>
      ${filtered.length ? '' : '<p class="text-center text-gray-500 py-4">No matching students</p>'}
      <button onclick="submitBulkAttendance()" ${selectedCount ? '' : 'disabled'} class="w-full bg-gradient-to-r from-emerald-700 to-teal-600 hover:from-emerald-800 hover:to-teal-700 text-white px-5 py-3 rounded-xl font-bold shadow-md btn-pop disabled:opacity-50 disabled:cursor-not-allowed">✅ Submit Attendance (${selectedCount})</button>
      <p class="text-xs text-gray-500 dark:text-gray-400 text-center">Eligible students: ${eligibleCount} · Existing records are protected from changes.</p>
    </div>`;

  if (searchFocused) {
    const nextSearch = document.getElementById('baSearch');
    if (nextSearch) {
      nextSearch.focus();
      if (searchCursor !== null) nextSearch.setSelectionRange(searchCursor, searchCursor);
    }
  }
}

function toggleBulkStudent(studentId, checked) {
  if (bulkAttendanceExisting[studentId]) return;
  if (checked) bulkAttendanceSelected.add(studentId);
  else bulkAttendanceSelected.delete(studentId);
  renderBulkAttendanceRows();
}

function selectAllBulkEligible() {
  bulkAttendanceRoster.forEach(s => {
    if (!bulkAttendanceExisting[s.id]) bulkAttendanceSelected.add(s.id);
  });
  renderBulkAttendanceRows();
}

function clearBulkSelection() {
  bulkAttendanceSelected.clear();
  renderBulkAttendanceRows();
}

async function submitBulkAttendance() {
  if (!currentTeacher || !bulkAttendanceContext) return toastError('Load a student list first');
  const studentIds = [...bulkAttendanceSelected];
  if (!studentIds.length) return toastWarning('Select at least one student');

  const ok = await Swal.fire({
    icon: 'question',
    title: 'Submit bulk attendance?',
    html: `<p class="text-sm">You are submitting <b>${studentIds.length}</b> new Present records.</p><p class="text-xs text-gray-500 mt-2">Previously marked students will not be changed.</p>`,
    showCancelButton: true,
    confirmButtonText: 'Submit',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#047857'
  });
  if (!ok.isConfirmed) return;

  showGlobalLoader();
  try {
    let sessionId = bulkAttendanceContext.sessionId;
    if (!sessionId) {
      const created = await db.rpc('t_get_or_create_bulk_session', {
        p_token: currentTeacher.token,
        p_year: bulkAttendanceContext.year,
        p_course_code: bulkAttendanceContext.courseCode,
        p_date: bulkAttendanceContext.date,
        p_session_year: bulkAttendanceContext.sessionYear
      });
      if (created.error || !created.data?.ok || !created.data?.session_id) {
        throw new Error(created.data?.message || created.error?.message || 'Could not prepare attendance session');
      }
      sessionId = created.data.session_id;
    }

    const { data, error } = await db.rpc('t_bulk_attendance', {
      p_token: currentTeacher.token,
      p_session_id: sessionId,
      p_student_ids: studentIds
    });
    if (error || !data?.ok) throw new Error(data?.message || error?.message || 'Bulk attendance submission failed');

    toastSuccess(`Saved ${data.inserted} attendance record(s). ${data.skipped_existing || 0} already existed and were skipped.`);
    await loadBulkAttendanceList();
  } catch (e) {
    console.error('Bulk attendance submit error:', e);
    toastError(e.message || 'Bulk attendance submission failed');
  } finally {
    hideGlobalLoader();
  }
}
