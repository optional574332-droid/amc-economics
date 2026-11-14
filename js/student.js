/* js/student.js — স্টুডেন্ট প্যানেল */
// ============================================================
// STUDENT PANEL
// ============================================================
let currentStudentToken = null;

async function studentLogin() {
  const session = document.getElementById('studentSession').value.trim();
  const roll = document.getElementById('studentRoll').value.trim();
  const regVerify = document.getElementById('studentRegVerify').value.trim();
  const errEl = document.getElementById('studentErr');
  errEl.textContent = '';
  setLoginButtonLoading('studentLoginBtn', true);
  showGlobalLoader();

  try {
    const { data, error } = await db.rpc('student_login_secure', {
      p_session: session,
      p_roll: roll,
      p_registration: regVerify
    });

    if (error || !data?.ok || !data?.token || !data?.student) {
      errEl.textContent = data?.message || 'Student login failed. Check your details.';
      return;
    }

    currentStudentToken = data.token;
    currentStudent = data.student;
    showSection('studentDashboard');
    await loadStudentData();
    toastSuccess(`Welcome, ${data.student.name}`);
  } catch (e) {
    console.error('Student login error:', e);
    errEl.textContent = 'Login failed. Check your connection and try again.';
  } finally {
    hideGlobalLoader();
    setLoginButtonLoading('studentLoginBtn', false);
  }
}

async function loadStudentData() {
  const token = currentStudentToken;
  if (!token) {
    currentStudent = null;
    showSection('studentLogin');
    return;
  }

  try {
    const { data: dashboard, error: dashboardError } = await db.rpc('student_get_dashboard', {
      p_student_token: token
    });
    if (dashboardError || !dashboard?.ok || !dashboard?.student) {
      currentStudentToken = null;
      currentStudent = null;
      const err = dashboard?.message || 'Student session expired. Please log in again.';
      showSection('studentLogin');
      const errEl = document.getElementById('studentErr');
      if (errEl) errEl.textContent = err;
      return;
    }

    const student = dashboard.student;
    currentStudent = student;
    const records = Array.isArray(dashboard.attendance_records) ? dashboard.attendance_records : [];
    const total = Number(dashboard.total_classes) || 0;
    const att = Number(dashboard.attended_classes) || 0;
    const pct = total > 0 ? ((att / total) * 100).toFixed(1) : 0;
    const pC = pct >= 75 ? 'emerald' : pct >= PASS_PCT ? 'amber' : 'red';

    await getCourseInfoMap();
    const { data: notices, error: noticeError } = await db.from('notices')
      .select('*')
      .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(5);
    if (noticeError) console.warn('Student notices unavailable:', noticeError.message);

    const rawRoutines = await fetchRoutineData({ session: student.session, year: student.year });
    const enriched = await enrichRoutineData(rawRoutines);
    const sortedRoutines = sortRoutineData(enriched);

    currentRoutineData = sortedRoutines;
    currentRoutineContext = {
      view: 'student',
      session: student.session,
      year: student.year,
      filterInfo: `${yearLabel(student.year)}`
    };

    document.getElementById('studentContent').innerHTML = `
      <div class="bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl p-5 mb-6 text-center">
        <p class="text-gray-500 dark:text-gray-400 text-sm">${escapeHtml(student.name)}</p>
        <p class="text-xs text-gray-400 dark:text-gray-500">${escapeHtml(student.session)} · ${escapeHtml(yearLabel(student.year))} · Roll <span class="num-display">${escapeHtml(student.class_roll)}</span></p>
      </div>
      <div class="bg-${pC}-50 dark:bg-${pC}-900/30 rounded-2xl p-6 mb-6 text-center shadow-sm">
        <p class="text-5xl font-bold text-${pC}-600 dark:text-${pC}-300 num-display mb-1">${pct}%</p>
        <p class="text-gray-600 dark:text-gray-400 font-bold">Attendance Rate</p>
        <p class="text-xs text-gray-500 dark:text-gray-500 mt-2"><span class="num-display">${att}</span> / <span class="num-display">${total}</span> classes</p>
      </div>
      <div id="studentExamBox" class="mb-2"></div>
      <div class="flex justify-between items-center flex-wrap gap-2 mb-3">
        <h3 class="font-bold text-lg dark:text-white flex items-center gap-2"><span>📅</span> My Class Routine</h3>
        ${sortedRoutines.length ? `
          <div class="flex gap-2">
            <button onclick="exportRoutineExcel()" class="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold btn-pop">📊 Excel</button>
            <button onclick="exportRoutinePDF()" class="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold btn-pop">📄 PDF</button>
          </div>` : ''}
      </div>
      ${sortedRoutines.length ? `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          ${renderRoutineCards(sortedRoutines, { showTeacher: true, showSession: false })}
        </div>
      ` : '<p class="text-gray-400 text-sm mb-8 bg-gray-50 dark:bg-gray-800 p-4 rounded-xl text-center">No routine found for this year</p>'}
      <h3 class="font-bold text-lg mb-3 dark:text-white flex items-center gap-2"><span>📋</span> Attendance History</h3>
      <div class="space-y-1 mb-8 max-h-60 overflow-y-auto">
        ${records.length ? records.map(r => { const ic = { present: '✅', absent: '❌', late: '⏰', excused: '📝' }; return `<div class="bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-xl flex justify-between text-sm dark:text-white"><span>${ic[r.status] || '✅'} <span class="num-display">${escapeHtml(r.attendance_sessions?.course_code ? courseLabel(r.attendance_sessions.course_code) : '-')}</span></span><span class="text-gray-500 dark:text-gray-400 num-display">${escapeHtml(r.attendance_sessions?.date || '')}</span></div>`; }).join('') : '<p class="text-gray-400 text-sm">No records</p>'}
      </div>
      <h3 class="font-bold text-lg mb-3 dark:text-white flex items-center gap-2"><span>📢</span> Notice Board</h3>
      ${notices?.map(n => `<div class="${n.priority === 'urgent' ? 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500' : 'bg-pink-50 dark:bg-pink-900/20 border-l-4 border-pink-400'} p-4 rounded-r-xl mb-2 shadow-sm"><b class="dark:text-white text-base">${n.priority === 'urgent' ? '🚨 ' : ''}${escapeHtml(n.title)}</b><p class="text-sm text-gray-600 dark:text-gray-300 mt-1">${escapeHtml(n.content)}</p></div>`).join('') || '<p class="text-gray-400 text-sm">No notices</p>'}
    `;
    if (typeof exsStudentLoad === 'function') exsStudentLoad(student);
  } catch (e) {
    console.error('Student dashboard error:', e);
    const target = document.getElementById('studentContent');
    if (target) target.innerHTML = '<p class="text-red-600 text-center py-6">Could not load student dashboard. Please try again.</p>';
  }
}
