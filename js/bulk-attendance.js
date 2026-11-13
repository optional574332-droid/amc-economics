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
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-bold dark:text-white">☑️ Bulk Attendance</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Select students who do not already have an attendance record for this class, course and date.</p>
      </div>
      <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl space-y-3">
        ${teacherPickerHtml('ba', 'baCourse', 'baSY')}
        <label class="block text-sm font-bold dark:text-gray-200">Class date</label>
        <input type="date" id="baDate" value="${attrEsc(today)}" class="w-full border-2 rounded-xl p-3 dark:bg-gray-600 dark:text-white dark:border-gray-500">
        <button onclick="loadBulkAttendanceList()" class="w-full bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold btn-pop">📋 Load Student List</button>
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

    const { data: session, error: sessionError } = await mySessOne({
      year, course: courseCode, date, session_year: sessionYear
    });
    if (sessionError) throw sessionError;

    let records = [];
    if (session?.id) {
      const result = await db.from('attendance_records')
        .select('student_id, attendance_source, marked_by, status')
        .eq('session_id', session.id);
      if (result.error) throw result.error;
      records = result.data || [];
    }

    bulkAttendanceRoster = sortStudents(students);
    bulkAttendanceExisting = Object.fromEntries(records.map(r => [r.student_id, r]));
    bulkAttendanceSelected = new Set();
    bulkAttendanceContext = {
      year, courseCode, date, sessionYear, sessionId: session?.id || null
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
  return 'আগের রেকর্ড · উৎস অজানা';
}

function renderBulkAttendanceRows() {
  const area = document.getElementById('bulkAttendanceArea');
  if (!area || !bulkAttendanceContext) return;

  const query = banglaToEnglish((document.getElementById('baSearch')?.value || '').trim()).toLowerCase();
  const sortMode = document.getElementById('baSort')?.value || getSortMode();
  const sorted = sortStudents(bulkAttendanceRoster);
  if (sortMode === 'reg') {
    sorted.sort((a, b) => _cmpReg(a.reg_no, b.reg_no) || _cmpRoll(a.class_roll, b.class_roll));
  }

  const filtered = sorted.filter(s => {
    if (!query) return true;
    return [s.name, s.class_roll, s.reg_no].some(v => String(v || '').toLowerCase().includes(query));
  });

  const lockedCount = Object.keys(bulkAttendanceExisting).length;
  const selectedCount = bulkAttendanceSelected.size;
  const eligibleCount = Math.max(0, bulkAttendanceRoster.length - lockedCount);

  area.innerHTML = `
    <div class="space-y-3">
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-xl bg-slate-100 dark:bg-slate-700 p-3"><p class="text-xl font-bold num-display dark:text-white">${bulkAttendanceRoster.length}</p><p class="text-xs text-gray-500 dark:text-gray-300">Students</p></div>
        <div class="rounded-xl bg-amber-50 dark:bg-amber-900/30 p-3"><p class="text-xl font-bold num-display text-amber-700 dark:text-amber-300">${lockedCount}</p><p class="text-xs text-amber-700 dark:text-amber-300">Already marked</p></div>
        <div class="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 p-3"><p class="text-xl font-bold num-display text-emerald-700 dark:text-emerald-300">${selectedCount}</p><p class="text-xs text-emerald-700 dark:text-emerald-300">Selected</p></div>
      </div>
      <div class="flex flex-col sm:flex-row gap-2">
        <input id="baSearch" value="${attrEsc(query)}" oninput="renderBulkAttendanceRows()" placeholder="Search name / roll / registration" class="min-w-0 flex-1 border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600">
        <select id="baSort" onchange="renderBulkAttendanceRows()" class="border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          <option value="roll" ${sortMode === 'roll' ? 'selected' : ''}>Sort: Roll</option>
          <option value="reg" ${sortMode === 'reg' ? 'selected' : ''}>Sort: Registration</option>
        </select>
      </div>
      <div class="flex gap-2 flex-wrap">
        <button onclick="selectAllBulkEligible()" class="bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-200 px-3 py-2 rounded-lg text-sm font-semibold">Select all eligible</button>
        <button onclick="clearBulkSelection()" class="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-2 rounded-lg text-sm font-semibold">Clear selection</button>
      </div>
      <div class="text-xs text-gray-500 dark:text-gray-400">আগে হাজিরা দেওয়া শিক্ষার্থীর চেকবক্স লক থাকবে। এখানে শুধু নতুন Present রেকর্ড যোগ হবে; পুরোনো রেকর্ড পরিবর্তন হবে না।</div>
      <div class="border dark:border-gray-600 rounded-xl overflow-hidden divide-y dark:divide-gray-600">
        ${filtered.map(s => {
          const existing = bulkAttendanceExisting[s.id];
          const checked = existing || bulkAttendanceSelected.has(s.id);
          const source = existing ? bulkAttendanceSourceLabel(existing) : '';
          return `
            <label class="flex items-center gap-3 p-3 ${existing ? 'bg-gray-100 dark:bg-gray-800 opacity-70 cursor-not-allowed' : 'bg-white dark:bg-gray-700 cursor-pointer'}">
              <input type="checkbox" ${checked ? 'checked' : ''} ${existing ? 'disabled' : ''} onchange="toggleBulkStudent('${attrEsc(s.id)}', this.checked)" class="w-5 h-5 accent-indigo-600 shrink-0">
              <span class="min-w-0 flex-1">
                <span class="block font-semibold text-sm dark:text-white"><span class="num-display">${escapeHtml(s.class_roll || '-')}</span> — ${escapeHtml(s.name || '')}${s.is_irregular ? ' <span class="chip chip-none">Irregular</span>' : ''}</span>
                <span class="block text-xs text-gray-500 dark:text-gray-300">Reg: <span class="num-display">${escapeHtml(s.reg_no || '-')}</span></span>
              </span>
              ${existing ? `<span class="text-[11px] font-semibold text-amber-700 dark:text-amber-300 text-right">${escapeHtml(source)}<br>Already marked</span>` : ''}
            </label>`;
        }).join('')}
      </div>
      ${filtered.length ? '' : '<p class="text-center text-gray-500 py-4">No matching students</p>'}
      <button onclick="submitBulkAttendance()" ${selectedCount ? '' : 'disabled'} class="w-full bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold btn-pop disabled:opacity-50 disabled:cursor-not-allowed">✅ Submit Attendance (${selectedCount})</button>
      <p class="text-xs text-gray-500 dark:text-gray-400 text-center">Eligible students: ${eligibleCount} · Existing records are protected from changes.</p>
    </div>`;
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
