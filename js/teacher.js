/* js/teacher.js — শিক্ষক প্যানেল: লগইন, PIN, লাইভ, Marks, Tracking */
// ============================================================
// TEACHER PANEL
// ============================================================
async function teacherLogin() {
  const userId = document.getElementById('teacherUserId').value.trim().toLowerCase();
  const pin = banglaToEnglish(document.getElementById('teacherPin').value.trim());
  const errEl = document.getElementById('teacherErr');
  errEl.textContent = '';
  if (!userId || !pin) { errEl.textContent = 'Enter User ID and PIN'; return; }
  setLoginButtonLoading('teacherLoginBtn', true);
  showGlobalLoader();
  try {
    const { data, error } = await db.rpc('teacher_login', { p_user_id: userId, p_pin: pin });
    if (error) { errEl.textContent = 'Login failed: ' + (error.message || 'Database error'); return; }
    if (!data || !data.ok) { errEl.textContent = data?.message || 'Invalid User ID or PIN'; return; }
    currentTeacher = { id: data.teacher_id, name: data.teacher_name, token: data.token || null };
    document.getElementById('teacherNameDisplay').textContent = data.teacher_name;
    showSection('teacherDashboard');
    
    document.getElementById('teacherBottomNav').classList.remove('hidden');
    showTeacherTab('takeAttendance');
    setActiveBottomNav('takeAttendance');
    
    toastSuccess(`Welcome, ${data.teacher_name}`);
    setTimeout(() => loadActivePinBanner(), 500);
    getCourseInfoMap();
    cacheTeacherStudents();
    loadScheduledClassBanner();
    if (scheduledBannerInterval) clearInterval(scheduledBannerInterval);
    scheduledBannerInterval = setInterval(loadScheduledClassBanner, 60000);
  } catch (e) {
    console.error('Teacher login error:', e);
    errEl.textContent = 'Login failed. Check your connection and try again.';
  } finally {
    hideGlobalLoader();
    setLoginButtonLoading('teacherLoginBtn', false);
  }
}

async function showTeacherTab(tab) {
  if (pinTimerInterval) { clearInterval(pinTimerInterval); pinTimerInterval = null; }
  if (liveReportInterval) { clearInterval(liveReportInterval); liveReportInterval = null; }
  const el = document.getElementById('teacherContent');
  closeMoreMenu();
  if (tab === 'examSchedule' || tab === 'examDuty') {
    if (typeof exsTeacherTab === 'function') exsTeacherTab(el, tab);
    else el.innerHTML = '<div class="text-center py-8 text-red-500">Exam Schedule could not load. Please refresh the page.</div>';
    return;
  }

  if (tab === 'takeAttendance') {
    const { data: activeSess } = await mySess({ active: true });
    if (activeSess && activeSess.length > 0) {
      const s = activeSess[0];
      const m = Math.max(0, Math.floor((new Date(s.expires_at) - new Date()) / 60000));
      el.innerHTML = `<div class="space-y-4 max-w-lg"><div class="flex justify-between items-center gap-2 flex-wrap"><h3 class="text-lg font-bold dark:text-white">📝 Take Attendance</h3><button id="sortModeBtn" onclick="toggleSortMode()" class="text-sm px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-100 font-semibold">🔢 Roll</button></div><div class="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-xl border-2 border-emerald-300 dark:border-emerald-700"><p class="text-sm text-emerald-700 dark:text-emerald-300 font-bold">🟢 Active class</p></div><div id="pinDisplay"></div></div>`;
      updateSortModeBtn();
      renderPinDisplay(s.pin, s.id, m, s.expires_at);
      return;
    }
    const { data: myCourses } = await db.from('teacher_courses').select('*').eq('teacher_id', currentTeacher.id);
    await getCourseInfoMap();
    const courseOpts = dedupeCourses(myCourses).map(c => `<option value="${c.course_code}|${c.year}">${escapeHtml(courseLabel(c.course_code))} — ${escapeHtml(yearLabel(c.year))}</option>`).join('') || '<option value="">No courses</option>';
    el.innerHTML = `
      <div class="space-y-4 max-w-lg">
        <div class="flex justify-between items-center gap-2 flex-wrap"><h3 class="text-lg font-bold dark:text-white">📝 Take Attendance</h3><button id="sortModeBtn" onclick="toggleSortMode()" class="text-sm px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-100 font-semibold">🔢 Roll</button></div>
        ${teacherPickerHtml('at', 'atCourseSelect', 'atSessionYear')}

        <input type="date" id="atDate" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600">
        <button onclick="generatePin()" class="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold btn-pop w-full">🎲 Generate PIN</button>
        <div id="pinDisplay"></div>
      </div>`;
    updateSortModeBtn();
    const dateInput = document.getElementById('atDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    tpInit('at', 'atCourseSelect', 'atSessionYear', dedupeCourses(myCourses));
  }
  else if (tab === 'liveReport') {
    el.innerHTML = `<div class="space-y-4"><h3 class="text-lg font-bold dark:text-white">🔴 Live Attendance</h3><p class="text-xs text-gray-500 dark:text-gray-400">💡 Updates every 5 seconds</p><select id="liveSessionSelect" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600"></select><div><label for="liveSortSelect" class="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-1">Sort by</label><select id="liveSortSelect" onchange="liveSortMode=this.value; if(document.getElementById('liveSessionSelect')?.value) subscribeLive(document.getElementById('liveSessionSelect').value)" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600"><option value="roll">Roll (low to high)</option><option value="reg">Registration (low to high)</option><option value="latest">Latest attendance first</option></select></div><div id="liveCount" class="text-center bg-red-50 dark:bg-red-900/30 rounded-2xl p-6"><p class="text-6xl font-bold text-red-600 pulse-live num-display">0</p><p class="text-gray-500 dark:text-gray-400">Present</p></div><div id="liveList" class="mt-4 space-y-1 max-h-96 overflow-y-auto"></div></div>`;
    loadLiveSessions();
  }
  else if (tab === 'manualEntry') {
    const { data: myCourses } = await db.from('teacher_courses').select('*').eq('teacher_id', currentTeacher.id);
    await getCourseInfoMap();
    const courseOpts = dedupeCourses(myCourses).map(c => `<option value="${c.course_code}|${c.year}">${escapeHtml(courseLabel(c.course_code))} — ${escapeHtml(yearLabel(c.year))}</option>`).join('') || '<option value="">No courses</option>';
    const today = new Date().toISOString().split('T')[0];
    el.innerHTML = `
      <div class="space-y-4 max-w-lg">
        <h3 class="text-lg font-bold dark:text-white">✍️ Manual Attendance</h3>
        ${teacherPickerHtml('me', 'meCourse', 'meSY')}
        <input type="date" id="meDate" value="${today}" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600">
        <label class="block text-sm font-bold text-gray-700 dark:text-gray-300">🔍 Search by name / roll / reg</label>
        <input id="meSearch" placeholder="e.g., John / 101 / I-345" autocomplete="off" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600">
        <div id="meSuggestionBox" class="hidden"></div>
        <input id="meRoll" placeholder="Selected roll" readonly class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600">
        <select id="meStatus" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600"><option value="present">✅ Present</option><option value="absent">❌ Absent</option><option value="late">⏰ Late</option><option value="excused">📝 Excused</option></select>
        <button onclick="manualAttendance()" class="bg-amber-600 text-white px-6 py-3 rounded-xl font-bold btn-pop w-full">Save</button>
      </div>`;
    setupManualSearch();
    tpInit('me', 'meCourse', 'meSY', dedupeCourses(myCourses));
  }
  else if (tab === 'bulkAttendance') {
    await renderTeacherBulkAttendance(el);
  }
  else if (tab === 'markEntry') {
    const { data: myCourses } = await db.from('teacher_courses').select('*').eq('teacher_id', currentTeacher.id);
    await getCourseInfoMap();
    const courseOpts = dedupeCourses(myCourses).map(c => `<option value="${c.course_code}|${c.year}">${escapeHtml(courseLabel(c.course_code))} — ${escapeHtml(yearLabel(c.year))}</option>`).join('') || '<option value="">No courses</option>';
    el.innerHTML = `
      <div class="space-y-4">
        <h3 class="text-lg font-bold dark:text-white">📊 Marks Entry</h3>
        ${teacherPickerHtml('mk', 'mkCourse', 'mkSY')}
        <select id="mkExam" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          ${(await getExamTypes()).map(e => `<option value="${attrEsc(e.name)}">${escapeHtml(e.name)}</option>`).join('')}
        </select>
        <button onclick="loadMarkEntry()" class="bg-purple-600 text-white px-6 py-3 rounded-xl font-bold btn-pop w-full">📝 Load Marks Entry</button>
        <div id="markEntryArea"></div>
      </div>`;
    tpInit('mk', 'mkCourse', 'mkSY', dedupeCourses(myCourses));
  }
  else if (tab === 'attendanceReport') {
    const { data: myCourses } = await db.from('teacher_courses').select('*').eq('teacher_id', currentTeacher.id);
    await getCourseInfoMap();
    const courseOpts = '<option value="">All courses</option>' + (dedupeCourses(myCourses).map(c => `<option value="${c.course_code}|${c.year}">${escapeHtml(courseLabel(c.course_code))} — ${escapeHtml(yearLabel(c.year))}</option>`).join('') || '');
    const today = new Date().toISOString().split('T')[0];
    el.innerHTML = `
      <div class="space-y-4">
        <h3 class="text-lg font-bold dark:text-white">📊 Attendance Report</h3>
        <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl space-y-3">
          ${teacherPickerHtml('tar', 'tarCourse', 'tarSY')}
          <div class="grid grid-cols-2 gap-2">
            <div><label class="block text-xs font-bold mb-1 dark:text-white">From</label><input type="date" id="tarFrom" value="${today}" class="w-full border-2 rounded-xl p-2 dark:bg-gray-600 dark:text-white dark:border-gray-500"></div>
            <div><label class="block text-xs font-bold mb-1 dark:text-white">To</label><input type="date" id="tarTo" value="${today}" class="w-full border-2 rounded-xl p-2 dark:bg-gray-600 dark:text-white dark:border-gray-500"></div>
          </div>
          <div class="flex gap-2 flex-wrap items-center">
            <button id="sortModeBtn" onclick="toggleSortMode()" class="text-sm px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-100 font-semibold">🔢 Roll</button>
            <button onclick="loadTeacherAttendanceReport()" class="flex-1 bg-teal-600 text-white px-4 py-3 rounded-xl font-bold btn-pop">🔍</button>
            <button onclick="exportTeacherAttendanceExcel()" class="bg-emerald-600 text-white px-4 py-3 rounded-xl font-bold btn-pop text-sm">📊</button>
            <button onclick="exportTeacherAttendancePDF()" class="bg-red-600 text-white px-4 py-3 rounded-xl font-bold btn-pop text-sm">📄</button>
            <button onclick="showGpsTeacherReport()" class="w-full bg-indigo-600 text-white px-4 py-3 rounded-xl font-bold btn-pop">🛰️ GPS Location Report</button>
          </div>
        </div>
        <div id="teacherAttendanceReportArea"></div>
      </div>`;
    tpInit('tar', 'tarCourse', 'tarSY', dedupeCourses(myCourses), { all: true });
    updateSortModeBtn();
  }
  else if (tab === 'myCourses') {
    const { data: myCourses } = await db.from('teacher_courses').select('*').eq('teacher_id', currentTeacher.id).order('session', { ascending: false });
    if (!myCourses || !myCourses.length) { el.innerHTML = '<p class="text-gray-400 text-center py-8">No courses</p>'; return; }
    await getCourseInfoMap();
    const grp = {};
    myCourses.forEach(c => {
      const k = `${c.course_code}|${c.year}`;
      if (!grp[k]) grp[k] = { ...c, slots: [] };
      if (c.class_day && c.time_slot) grp[k].slots.push({ class_day: c.class_day, time_slot: c.time_slot, room: c.room });
    });
    const details = await Promise.all(Object.values(grp).map(async c => {
      const info = { course_name: courseInfo(c.course_code).name };
      const { count } = await db.from('attendance_sessions').select('id', { count: 'exact', head: true }).eq('teacher_id', currentTeacher.id).eq('course_code', c.course_code).eq('year', c.year);
      return { ...c, course_name: info?.course_name, sessionCount: count || 0 };
    }));
    el.innerHTML = `
      <h3 class="text-lg font-bold dark:text-white mb-4">📚 My Courses (${details.length})</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${details.map(c => `
          <div class="bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/30 dark:to-blue-900/30 p-4 rounded-xl border-2 border-cyan-200 dark:border-cyan-700">
            <p class="font-bold text-gray-800 dark:text-white"><span class="num-display">${escapeHtml(courseLabel(c.course_code, c.course_name))}</span></p>
            <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">📅 ${escapeHtml(yearLabel(c.year))}</p>
            <p class="text-xs text-cyan-700 dark:text-cyan-300 mt-2">📊 <span class="num-display">${c.sessionCount}</span> classes</p>
            <div class="mt-1">${slotChips(c.slots)}</div>
          </div>`).join('')}
      </div>`;
  }
  else if (tab === 'myRoutine') {
    await loadTeacherRoutineView('mine');
  }
  else if (tab === 'tracking') {
    el.innerHTML = `
      <div class="space-y-4">
        <h3 class="text-lg font-bold dark:text-white">🔍 Device Tracking</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400">Track multiple students from the same device</p>
        <div class="bg-orange-50 dark:bg-orange-900/30 p-4 rounded-xl space-y-3">
          <div>
            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">📱 Search by Device ID</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">💡 Copy device ID from Attendance Report</p>
            <div class="flex gap-2">
              <input id="trackDeviceInput" placeholder="e.g., dev_i7amvt" class="flex-1 border-2 rounded-xl p-2 dark:bg-gray-700 dark:text-white dark:border-gray-600" style="font-family: monospace;">
              <button onclick="searchByDeviceId()" class="bg-orange-600 text-white px-4 py-2 rounded-xl font-bold btn-pop">🔍</button>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300">Date From<input id="trackDateFrom" type="date" class="mt-1 w-full border-2 rounded-xl p-2 dark:bg-gray-700 dark:text-white dark:border-gray-600"></label>
            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300">Date To<input id="trackDateTo" type="date" class="mt-1 w-full border-2 rounded-xl p-2 dark:bg-gray-700 dark:text-white dark:border-gray-600"></label>
          </div>
          <div>
            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">🎓 Search by Student Roll</label>
            <div class="flex gap-2">
              <input id="trackRollInput" placeholder="e.g., 101 or I-122" class="flex-1 border-2 rounded-xl p-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
              <button onclick="searchByStudentRoll()" class="bg-orange-600 text-white px-4 py-2 rounded-xl font-bold btn-pop">🔍</button>
            </div>
          </div>
        </div>
        <div id="trackingResultArea">
          <div class="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-xl text-center">
            <p class="text-sm text-blue-700 dark:text-blue-300">💡 Search by Device ID or Roll</p>
            <p class="text-xs text-blue-600 dark:text-blue-400 mt-2">💡 Partial Device ID works too</p>
          </div>
        </div>
      </div>`;
  }
}

function setupManualSearch() {
  const si = document.getElementById('meSearch');
  let timer = null;
  si.addEventListener('input', (e) => {
    const q = banglaToEnglish(e.target.value.trim());
    if (timer) clearTimeout(timer);
    if (!q || q.length < 1) { document.getElementById('meSuggestionBox').classList.add('hidden'); return; }
    timer = setTimeout(() => searchStudentForManual(q), 300);
  });
}

async function searchStudentForManual(query) {
  const cv = document.getElementById('meCourse').value;
  if (!cv) return;
  const year = cv.split('|')[1];
  const session_year = parseInt(document.getElementById('meSY').value, 10);
  if (!session_year) return toastWarning('Select session year');
  const q = String(query).replace(/[,()*%]/g, '');
  if (!navigator.onLine) {
    const cached = localStorage.getItem('amc_students_' + year + '_' + session_year);
    if (cached) {
      const all = JSON.parse(cached), lc = q.toLowerCase();
      let f = all.filter(st => String(st.class_roll) === q || String(st.reg_no) === q);
      if (!f.length) f = all.filter(st => String(st.class_roll || '').toLowerCase().includes(lc) || String(st.reg_no || '').toLowerCase().includes(lc) || String(st.name || '').toLowerCase().includes(lc));
      renderManualSuggestions(f.slice(0, 10));
    }
    return;
  }
  const cols = 'id, name, class_roll, reg_no, session, is_irregular';
  let { data: hit } = await db.from('students').select(cols).eq('year', year).eq('session_year', session_year).eq('status', 'active').or(rollFilter(q, false)).limit(5);
  if (!hit || !hit.length) { const r = await db.from('students').select(cols).eq('year', year).eq('session_year', session_year).eq('status', 'active').or(rollFilter(q, true)).limit(10); hit = r.data || []; }
  renderManualSuggestions(hit);
}

function renderManualSuggestions(students) {
  const box = document.getElementById('meSuggestionBox');
  window._meStuId = null;
  if (!students || !students.length) {
    box.classList.remove('hidden');
    box.className = 'suggestion-box mb-3';
    box.innerHTML = '<div class="p-3 text-sm text-red-500">❌ Not found</div>';
    return;
  }
  const sorted = sortStudents(students);
  box.classList.remove('hidden');
  box.className = 'suggestion-box mb-3';
  box.innerHTML = sorted.map(s => `
    <div class="suggestion-item" data-id="${escapeHtml(s.id)}" data-roll="${escapeHtml(s.class_roll)}" data-name="${escapeHtml(s.name)}">
      <div><div class="font-bold text-sm"><span class="num-display">${escapeHtml(s.class_roll)}</span> — ${escapeHtml(s.name)}${s.is_irregular ? ' <span class="chip chip-none">Irregular</span>' : ''}</div><div class="text-xs text-gray-500 dark:text-gray-400">Reg: <span class="num-display">${escapeHtml(s.reg_no || '-')}</span></div></div>
      <span class="text-indigo-500">›</span>
    </div>`).join('');
  box.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      window._meStuId = item.dataset.id;
      document.getElementById('meRoll').value = item.dataset.roll;
      document.getElementById('meSearch').value = `${item.dataset.roll} — ${item.dataset.name}`;
      box.classList.add('hidden'); box.innerHTML = '';
    });
  });
}

// ============================================================
// SMART PIN BANNER
// ============================================================
const BD_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function getBangladeshNow() {
  const d = new Date(Date.now() + 6 * 3600 * 1000);
  return { day: BD_DAY_NAMES[d.getUTCDay()], minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), dateStr: d.toISOString().slice(0, 10) };
}

function parseSlotStartMinutes(slot) {
  const m = String(slot || '').match(/^\s*(\d{1,2})[.:](\d{2})/);
  if (!m) return null;
  let h = parseInt(m[1], 10); const mi = parseInt(m[2], 10);
  if (h < 8) h += 12;
  return h * 60 + mi;
}

async function loadScheduledClassBanner() {
  const c = document.getElementById('scheduledClassBannerContainer');
  if (!c) return;
  if (!currentTeacher) { c.innerHTML = ''; return; }

  const bd = getBangladeshNow();
  const { data, error } = await db.from('teacher_courses').select('*').eq('teacher_id', currentTeacher.id).eq('class_day', bd.day).not('time_slot', 'is', null);
  if (error || !data) return;

  const due = data.filter(r => { const st = parseSlotStartMinutes(r.time_slot); return st !== null && bd.minutes >= st - 10 && bd.minutes <= st + 30; });
  if (!due.length) { c.innerHTML = ''; return; }

  const dayBase = Date.parse(bd.dateStr + 'T00:00:00Z') - 6 * 3600 * 1000;
  const { data: act } = await mySess({ from: bd.dateStr, to: bd.dateStr });
  const pending = due.filter(r => { const winStart = dayBase + (parseSlotStartMinutes(r.time_slot) - 10) * 60000; return !(act || []).some(a => a.course_code === r.course_code && a.year === r.year && new Date(a.created_at).getTime() >= winStart); });
  if (!pending.length) { c.innerHTML = ''; return; }

  await getCourseInfoMap();
  c.innerHTML = pending.map(r => {
    const info = courseInfo(r.course_code);
    const name = info.name || info.short || r.course_code;
    return `
      <div class="mb-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white p-5 rounded-2xl shadow-xl border-4 border-amber-300 fade-in">
        <p class="text-xs font-bold tracking-wider opacity-90 mb-1">⏰ CLASS TIME</p>
        <p class="text-xl md:text-2xl font-bold leading-snug">Scheduled: ${escapeHtml(name)} (<span class="num-display">${escapeHtml(r.course_code)}</span>), ${escapeHtml(yearLabel(r.year))}, <span class="num-display">${escapeHtml(r.time_slot)}</span>. Generate PIN now.</p>
        <button data-code="${attrEsc(r.course_code)}" data-year="${attrEsc(r.year)}" onclick="generateScheduledPin(this)" class="mt-4 w-full bg-white text-orange-700 text-xl font-bold py-4 rounded-2xl btn-pop shadow-lg">🎲 Generate PIN</button>
      </div>`;
  }).join('');
}

async function generateScheduledPin(btn) {
  if (!currentTeacher || !btn) return;
  const course_code = btn.dataset.code, year = btn.dataset.year;
  let session_year;
  try { session_year = await pickSessionYear(year); } catch (e) { if (e.message !== 'Cancelled') toastError(e.message); return; }
  btn.disabled = true;
  showGlobalLoader();
  try {
    const { data, error } = await db.rpc('t_create_session', { p_token: currentTeacher.token, p_year: year, p_course_code: course_code, p_date: getBangladeshNow().dateStr, p_session_year: session_year });
    if (error || !data || !data.ok) { btn.disabled = false; return toastError((data && data.message) || 'PIN generation failed'); }
    toastSuccess('PIN generated');
    await showTeacherTab('takeAttendance');
    loadActivePinBanner();
    loadScheduledClassBanner();
  } catch (e) { btn.disabled = false; toastError(e.message || 'PIN generation failed'); } finally { hideGlobalLoader(); }
}

async function loadActivePinBanner() {
  if (!currentTeacher) return;
  const c = document.getElementById('activePinBannerContainer');
  if (!c) return;
  const { data } = await mySess({ active: true });
  if (!data || !data.length) { c.innerHTML = ''; if (activeSessionCheckInterval) { clearInterval(activeSessionCheckInterval); activeSessionCheckInterval = null; } return; }
  const s = data[0];
  await getCourseInfoMap();
  c.innerHTML = `<div id="activePinBanner" class="mb-4 bg-gradient-to-r from-emerald-500 to-emerald-600 dark:from-emerald-700 dark:to-emerald-800 text-white p-4 rounded-2xl shadow-lg"><div class="flex items-center justify-between flex-wrap gap-3"><div><p class="text-xs opacity-90">🟢 Active class</p><p class="font-bold text-lg"><span class="num-display">${escapeHtml(courseLabel(s.course_code))}</span> — PIN: <span class="font-mono text-2xl tracking-wider num-display">${escapeHtml(s.pin)}</span></p><p class="text-xs opacity-90 mt-1">📅 <span class="num-display">${escapeHtml(s.date)}</span> · ⏰ <span id="bannerTimer" class="num-display">...</span></p></div><button onclick="closeActivePinFromBanner('${escapeHtml(s.id)}')" class="bg-white text-red-600 px-4 py-2 rounded-xl font-bold btn-pop text-sm">🔒 Close PIN</button></div></div>`;
  if (activeSessionCheckInterval) clearInterval(activeSessionCheckInterval);
  const expiry = new Date(s.expires_at).getTime();
  const tick = () => {
    const diff = expiry - Date.now(); const el = document.getElementById('bannerTimer');
    if (!el) return;
    if (diff <= 0) { el.textContent = 'Expired'; clearInterval(activeSessionCheckInterval); activeSessionCheckInterval = null; setTimeout(() => loadActivePinBanner(), 1500); return; }
    const m = Math.floor(diff / 60000), sec = Math.floor((diff % 60000) / 1000);
    el.textContent = `${m}:${String(sec).padStart(2, '0')} left`;
  };
  tick(); activeSessionCheckInterval = setInterval(tick, 1000);
  setTimeout(() => { if (currentTeacher) loadActivePinBanner(); }, 30000);
}

async function closeActivePinFromBanner(sessionId) {
  const ok = await confirmAction('Close PIN?', 'Students will not be able to mark attendance.', 'Close', '#dc2626');
  if (!ok) return;
  showGlobalLoader();
  try {
    const { data, error } = await db.rpc('t_close_session', { p_token: currentTeacher.token, p_session_id: sessionId });
    if (error || !data.ok) return toastError(data?.message || error?.message);
    toastSuccess('PIN closed');
    loadActivePinBanner();
    const tc = document.getElementById('teacherContent');
    if (tc && tc.querySelector('#atCourseSelect')) showTeacherTab('takeAttendance');
  } finally { hideGlobalLoader(); }
}

async function generatePin() {
  const sel = document.getElementById('atCourseSelect');
  const sessionYearStr = document.getElementById('atSessionYear').value;
  const date = document.getElementById('atDate').value;

  if (!sel || !sel.value) return toastWarning('Select course');
  if (!sessionYearStr) return toastWarning('Select session year');
  if (!date) return toastWarning('Select date');

  const [course_code, year] = sel.value.split('|');
  const session_year = parseInt(sessionYearStr, 10);

  showGlobalLoader();
  try {
    const { data, error } = await db.rpc('t_create_session', {
      p_token: currentTeacher.token,
      p_year: year,
      p_course_code: course_code,
      p_date: date,
      p_session_year: session_year
    });
    if (error || !data || !data.ok) return toastError((data && data.message) || 'PIN generation failed');
    toastSuccess('PIN generated');
    renderPinDisplay(data.pin, data.session_id, 45, new Date(Date.now() + 45 * 60000).toISOString());
    loadActivePinBanner();
  } finally { hideGlobalLoader(); }
}

function renderPinDisplay(pin, sessionId, mLeft, expiresAt) {
  const el = document.getElementById('pinDisplay');
  if (!el) return;
  el.innerHTML = `<div class="bg-indigo-50 dark:bg-indigo-900/40 rounded-2xl p-6 text-center"><p class="text-gray-500 dark:text-gray-400 mb-1">Show to students</p><div class="flex justify-center items-center gap-2"><p class="text-7xl font-bold text-indigo-600 dark:text-indigo-300 tracking-widest num-display">${escapeHtml(pin)}</p></div><p class="pin-timer text-gray-600 dark:text-gray-300 mt-3" id="pinTimerDisplay">⏰ <span class="num-display">${mLeft}</span> min</p><button id="closePinBtn" class="mt-4 bg-red-600 text-white px-6 py-3 rounded-xl font-bold btn-pop w-full">🔒 Close PIN</button></div>`;
  const expiry = expiresAt ? new Date(expiresAt).getTime() : (Date.now() + mLeft * 60000);
  if (pinTimerInterval) clearInterval(pinTimerInterval);
  pinTimerInterval = setInterval(() => {
    const diff = expiry - Date.now(); const t = document.getElementById('pinTimerDisplay'); const btn = document.getElementById('closePinBtn');
    if (diff <= 0) { clearInterval(pinTimerInterval); pinTimerInterval = null; if (t) t.innerHTML = '⏰ Expired'; if (btn) btn.disabled = true; loadActivePinBanner(); return; }
    const m = Math.floor(diff / 60000), s = Math.floor((diff % 60000) / 1000);
    if (t) t.innerHTML = `⏰ <span class="num-display">${m}:${String(s).padStart(2, '0')}</span> left`;
  }, 1000);
  const btn = document.getElementById('closePinBtn');
  if (btn) btn.addEventListener('click', () => closePin(sessionId));
}

async function closePin(sessionId) {
  const ok = await confirmAction('Close PIN?', 'Students will not be able to mark attendance.', 'Close', '#dc2626');
  if (!ok) return;
  showGlobalLoader();
  try {
    const { data, error } = await db.rpc('t_close_session', { p_token: currentTeacher.token, p_session_id: sessionId });
    if (error || !data.ok) return toastError(data?.message || error?.message);
    if (pinTimerInterval) { clearInterval(pinTimerInterval); pinTimerInterval = null; }
    const el = document.getElementById('pinDisplay');
    if (el) el.innerHTML = `<div class="bg-gray-100 dark:bg-gray-700 rounded-2xl p-6 text-center"><p class="text-4xl mb-2">🔒</p><p class="text-gray-600 dark:text-gray-300 font-bold">PIN closed</p></div>`;
    toastSuccess('PIN closed');
    loadActivePinBanner();
  } finally { hideGlobalLoader(); }
}

async function loadLiveSessions() {
  const sel = document.getElementById('liveSessionSelect');
  if (!sel) return;
  const today = getBangladeshNow().dateStr;
  const [activeResult, todayResult] = await Promise.all([
    mySess({ active: true }),
    mySess({ from: today, to: today })
  ]);
  if (activeResult.error || todayResult.error) {
    sel.innerHTML = '<option>Could not load sessions</option>';
    return;
  }
  const byId = new Map();
  [...(todayResult.data || []), ...(activeResult.data || [])].forEach(s => byId.set(s.id, s));
  const data = [...byId.values()].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime() ||
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  await getCourseInfoMap();
  sel.innerHTML = data.map(s => {
    const isLive = s.is_active && new Date(s.expires_at).getTime() > Date.now();
    const isBulk = s.session === 'ALL';
    const label = isBulk ? 'Bulk Attendance' : (isLive ? `Live — PIN ${escapeHtml(s.pin)}` : `Closed — PIN ${escapeHtml(s.pin)}`);
    return `<option value="${s.id}">${escapeHtml(courseLabel(s.course_code))} — ${escapeHtml(s.date)} — ${label}</option>`;
  }).join('') || '<option>No sessions today</option>';
  if (data.length) {
    sel.onchange = () => subscribeLive(sel.value);
    subscribeLive(data[0].id);
  }
}

let liveSortMode = 'roll';

function compareLiveStudentValues(a, b, field) {
  const av = String(a?.students?.[field] ?? '').trim();
  const bv = String(b?.students?.[field] ?? '').trim();
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
}

function subscribeLive(sessionId) {
  // Realtime publication is not enabled for attendance_records in Production.
  // Use the same 5-second refresh cadence, but fetch only through the
  // token-validated RPC so a browser cannot read arbitrary session records.
  if (liveChannel) { db.removeChannel(liveChannel); liveChannel = null; }
  if (liveReportInterval) { clearInterval(liveReportInterval); liveReportInterval = null; }

  const refresh = async () => {
    if (!currentTeacher?.token) {
      const countEl = document.getElementById('liveCount');
      const listEl = document.getElementById('liveList');
      if (countEl) countEl.innerHTML = '<p class="text-lg font-bold text-red-600">Session expired</p>';
      if (listEl) listEl.textContent = 'Please log in again.';
      return;
    }

    const { data: result, error } = await db.rpc('t_live_attendance', {
      p_token: currentTeacher.token,
      p_session_id: sessionId
    });

    const el = document.getElementById('liveCount');
    const el2 = document.getElementById('liveList');
    if (error || !result?.ok) {
      if (el) el.innerHTML = '<p class="text-lg font-bold text-red-600">Could not load</p><p class="text-gray-500 dark:text-gray-400">Live report unavailable</p>';
      if (el2) el2.textContent = result?.message || error?.message || 'Could not load live attendance.';
      return;
    }

    const rows = Array.isArray(result.rows) ? result.rows : [];
    if (el) el.innerHTML = `<p class="text-6xl font-bold text-emerald-600 num-display">${Number(result.count) || 0}</p><p class="text-gray-500 dark:text-gray-400">Present</p>${result.truncated ? '<p class="text-xs text-amber-600">Showing first 1,000 records</p>' : ''}`;
    const sortSelect = document.getElementById('liveSortSelect');
    const sortMode = sortSelect?.value || liveSortMode || 'roll';
    liveSortMode = sortMode;
    const sortedRows = [...rows].sort((a, b) => {
      if (sortMode === 'latest') return new Date(b.marked_at) - new Date(a.marked_at);
      const field = sortMode === 'reg' ? 'reg_no' : 'class_roll';
      return compareLiveStudentValues(a, b, field) || compareLiveStudentValues(a, b, field === 'class_roll' ? 'reg_no' : 'class_roll');
    });
    if (el2) el2.innerHTML = sortedRows.map(r => {
      const markedAt = r.marked_at ? new Date(r.marked_at) : null;
      return `<div class="bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2 rounded-lg flex justify-between items-center gap-3"><div class="min-w-0"><div class="dark:text-white font-medium">✅ ${escapeHtml(r.students?.name || 'Unknown student')}</div><div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 num-display">Roll: ${escapeHtml(r.students?.class_roll || '-')} · Reg: ${escapeHtml(r.students?.reg_no || '-')}</div></div><span class="text-xs text-gray-400 num-display whitespace-nowrap">${markedAt ? markedAt.toLocaleTimeString('en-GB') : '-'}</span></div>`;
    }).join('');
  };

  liveReportInterval = setInterval(refresh, 5000);
  refresh();
}

async function manualAttendance() {
  const cv = document.getElementById('meCourse').value;
  const date = document.getElementById('meDate').value;
  const roll = document.getElementById('meRoll').value.trim().replace(/[,()*%]/g, '');
  const status = document.getElementById('meStatus').value;
  if (!cv || !date || !roll) return toastWarning('Fill all fields');
  const [course_code, year] = cv.split('|');
  const session_year = parseInt(document.getElementById('meSY').value, 10);
  if (!session_year) return toastWarning('Select session year');
  showGlobalLoader();
  try {
    let { data: sess } = await mySessOne({ year, course: course_code, date, session_year });
    if (!sess) {
      const { data: pd, error: pe } = await db.rpc('t_create_session', { p_token: currentTeacher.token, p_year: year, p_course_code: course_code, p_date: date, p_session_year: session_year });
      if (pe || !pd?.ok || !pd?.session_id) return toastError((pd && pd.message) || 'Session creation failed');
      ({ data: sess } = await mySessOne({ year, course: course_code, date, session_year }));
    }
    if (!sess) return toastError('Session ID not found');
    let stu = null;
    if (window._meStuId) stu = { id: window._meStuId, name: document.getElementById('meSearch').value };
    else {
      const { data: student } = await db.from('students').select('id, name').eq('year', year).eq('session_year', session_year).eq('status', 'active').or(rollFilter(roll, false)).limit(2);
      if (student && student.length > 1) return toastWarning('Several students match — search and pick one from the list');
      stu = student && student[0] ? student[0] : null;
    }
    if (!stu) return toastError('Student not found');
    const { data: ma, error: maErr } = await db.rpc('t_manual_attendance', { p_token: currentTeacher.token, p_session_id: sess.id, p_student_id: stu.id, p_status: status });
    if (maErr || !ma || !ma.ok) return toastError((ma && ma.message) || (maErr && maErr.message) || 'Save failed');
    toastSuccess('Saved: ' + stu.name);
    window._meStuId = null;
    document.getElementById('meRoll').value = '';
    document.getElementById('meSearch').value = '';
  } finally { hideGlobalLoader(); }
}

// ============================================================
// TEACHER ATTENDANCE REPORT
// ============================================================
let currentTeacherAttendanceData = null;

function teacherAttendanceSessionLabel(session, records) {
  const sources = records || [];
  const hasBulk = sources.some(r => r.attendance_source === 'bulk');
  const hasPin = sources.some(r => r.attendance_source === 'pin' || (!r.attendance_source && r.marked_by == null));
  const hasManual = sources.some(r => r.attendance_source === 'manual');
  const hasLegacyTeacher = sources.some(r => !r.attendance_source && r.marked_by != null);

  if (hasBulk && (hasPin || hasManual || hasLegacyTeacher)) return 'Mixed attendance';
  if (hasBulk) return 'Bulk Attendance';
  if (hasManual) return 'Manual Attendance';
  if (hasPin) return 'PIN Attendance';
  if (hasLegacyTeacher) return 'Teacher entry (legacy)';
  return 'Attendance';
}

function teacherAttendanceRecordSource(record) {
  if (record.attendance_source === 'bulk') return 'Bulk';
  if (record.attendance_source === 'manual') return 'Manual';
  if (record.attendance_source === 'pin') return 'PIN';
  return 'Legacy / unknown';
}

async function loadTeacherAttendanceReport() {
  const cv = document.getElementById('tarCourse').value;
  const fromDate = document.getElementById('tarFrom').value;
  const toDate = document.getElementById('tarTo').value;
  const area = document.getElementById('teacherAttendanceReportArea');
  if (!fromDate || !toDate) { area.innerHTML = '<p class="text-red-500 text-center py-4">Pick both dates</p>'; return; }
  area.innerHTML = '<p class="text-center py-4 dark:text-gray-300">⏳...</p>';
  await getCourseInfoMap();
  let fy = document.getElementById('tarYear').value, fc = null;
  if (cv) [fc, fy] = cv.split('|');
  const fsy = document.getElementById('tarSY').value;
  let q = mySess({ from: fromDate, to: toDate, session_year: fsy, year: fy, course: fc });
  
  const { data: ownSessions, error: sErr } = await q;
  if (sErr) { area.innerHTML = `<p class="text-red-500 text-center py-4">❌ ${escapeHtml(sErr.message)}</p>`; return; }

  // Include shared sessions containing Bulk rows submitted by this teacher.
  // Before the new migration is applied, the RPC may not exist; keep the
  // existing report working and continue with teacher-owned sessions only.
  let sessions = ownSessions || [];
  if (currentTeacher?.token) {
    const { data: bulkSessions, error: bulkSessionError } = await db.rpc('t_my_bulk_sessions', {
      p_token: currentTeacher.token,
      p_from: fromDate,
      p_to: toDate,
      p_session_year: fsy ? parseInt(fsy, 10) : null,
      p_year: fy || null,
      p_course_code: fc || null
    });
    if (!bulkSessionError && Array.isArray(bulkSessions)) {
      const seen = new Set(sessions.map(s => s.id));
      bulkSessions.forEach(s => { if (!seen.has(s.id)) { sessions.push(s); seen.add(s.id); } });
    }
  }

  if (!sessions.length) { area.innerHTML = '<p class="text-gray-400 text-center py-4">No classes in this period</p>'; return; }
  const sIds = sessions.map(s => s.id);
  const reportRecords = [];
  for (let i = 0; i < sIds.length; i += 25) {
    const { data: reportResult, error: reportError } = await db.rpc('t_teacher_attendance_records', {
      p_token: currentTeacher.token,
      p_session_ids: sIds.slice(i, i + 25)
    });
    if (reportError || !reportResult?.ok) {
      area.innerHTML = `<p class="text-red-500 text-center py-4">❌ ${escapeHtml(reportResult?.message || reportError?.message || 'Could not load attendance records')}</p>`;
      return;
    }
    if (reportResult.truncated) {
      area.innerHTML = '<p class="text-red-500 text-center py-4">এই রিপোর্টে রেকর্ডের সংখ্যা বেশি। অনুগ্রহ করে তারিখের পরিসর ছোট করুন।</p>';
      return;
    }
    if (Array.isArray(reportResult.records)) reportRecords.push(...reportResult.records);
  }

  const byS = {};
  sessions.forEach(s => { byS[s.id] = { session: s, records: [] }; });
  reportRecords.forEach(r => {
    const group = byS[r.session_id];
    if (!group) return;
    // The RPC already enforces owner/shared-bulk authorization; retain this
    // client-side filter as defense in depth for shared sessions.
    if (group.session.teacher_id !== currentTeacher.id &&
        !(r.marked_by === currentTeacher.id && r.attendance_source === 'bulk')) return;
    group.records.push(r);
  });
  const rows = Object.values(byS).filter(x => x.records.length > 0).map(({ session, records }) => ({ session, records, present: records.filter(r => r.status === 'present').length, absent: records.filter(r => r.status === 'absent').length, late: records.filter(r => r.status === 'late').length, excused: records.filter(r => r.status === 'excused').length }));
  if (!rows.length) { currentTeacherAttendanceData = null; area.innerHTML = '<p class="text-gray-400 text-center py-4">No classes with attendance in this period</p>'; return; }
  currentTeacherAttendanceData = { fromDate, toDate, rows, courseLabel: cv || 'All courses' };
  renderTeacherAttendanceReport();
}

function renderTeacherAttendanceReport() {
  const data = currentTeacherAttendanceData;
  const area = document.getElementById('teacherAttendanceReportArea');
  if (!data || !area) return;
  const { rows, fromDate, toDate } = data;
  const tP = rows.reduce((s, r) => s + r.present, 0), tA = rows.reduce((s, r) => s + r.absent, 0), tL = rows.reduce((s, r) => s + r.late, 0), tE = rows.reduce((s, r) => s + r.excused, 0);
  area.innerHTML = `
    <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl mb-3">
      <p class="text-sm dark:text-white mb-2"><b>From:</b> <span class="num-display">${escapeHtml(fromDate)}</span> to <span class="num-display">${escapeHtml(toDate)}</span> · <b>Classes:</b> <span class="num-display">${rows.length}</span></p>
      <div class="grid grid-cols-4 gap-2 text-center">
        <div class="bg-emerald-50 dark:bg-emerald-900/30 p-2 rounded-lg"><p class="text-emerald-700 dark:text-emerald-300 font-bold text-xs">✅</p><p class="text-xl font-bold text-emerald-800 dark:text-emerald-200 num-display">${tP}</p></div>
        <div class="bg-red-50 dark:bg-red-900/30 p-2 rounded-lg"><p class="text-red-700 dark:text-red-300 font-bold text-xs">❌</p><p class="text-xl font-bold text-red-800 dark:text-red-200 num-display">${tA}</p></div>
        <div class="bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg"><p class="text-amber-700 dark:text-amber-300 font-bold text-xs">⏰</p><p class="text-xl font-bold text-amber-800 dark:text-amber-200 num-display">${tL}</p></div>
        <div class="bg-blue-50 dark:bg-blue-900/30 p-2 rounded-lg"><p class="text-blue-700 dark:text-blue-300 font-bold text-xs">📝</p><p class="text-xl font-bold text-blue-800 dark:text-blue-200 num-display">${tE}</p></div>
      </div>
    </div>
    <div class="space-y-3">
      ${rows.map(({ session: s, records }) => `
        <details class="bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl" open>
          <summary class="cursor-pointer p-3 font-bold dark:text-white">📅 <span class="num-display">${escapeHtml(s.date)}</span> · 📚 <span class="num-display">${escapeHtml(courseLabel(s.course_code))}</span> · ${escapeHtml(teacherAttendanceSessionLabel(s, records))}</summary>
          <div class="p-3 pt-0">
            ${records.length === 0 ? '<p class="text-gray-400 text-sm">No attendance recorded</p>' : `
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">💡 Click status to change</p>
              <table class="min-w-full text-xs border dark:border-gray-600">
                <thead class="bg-gray-100 dark:bg-gray-600"><tr><th class="p-2 border dark:border-gray-600 dark:text-white num-cell">Roll</th><th class="p-2 border dark:border-gray-600 dark:text-white num-cell">Reg</th><th class="p-2 border dark:border-gray-600 dark:text-white text-left">Name</th><th class="p-2 border dark:border-gray-600 dark:text-white">Time</th><th class="p-2 border dark:border-gray-600 dark:text-white">Device</th><th class="p-2 border dark:border-gray-600 dark:text-white">Status</th></tr></thead>
                <tbody>
                  ${sortStudents(records.map(r => ({ class_roll: r.students?.class_roll || '', ...r }))).map(r => {
                    const icons = { present: '✅ Present', absent: '❌ Absent', late: '⏰ Late', excused: '📝 Excused' };
                    const dt = r.marked_at ? new Date(r.marked_at) : null;
                    return `<tr class="dark:text-white"><td class="p-2 border dark:border-gray-600 text-center num-cell">${escapeHtml(r.students?.class_roll || '-')}</td><td class="p-2 border dark:border-gray-600 text-center num-cell">${escapeHtml(r.students?.reg_no || '-')}</td><td class="p-2 border dark:border-gray-600">${escapeHtml(r.students?.name || '-')}</td><td class="p-2 border dark:border-gray-600 text-center num-display">${dt ? dt.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) : '-'}</td><td class="p-2 border dark:border-gray-600 text-center"><span class="device-badge">${shortDevice(r.device_id)}</span></td><td class="p-2 border dark:border-gray-600 text-center"><button onclick="changeAttendanceStatus('${r.id}', '${r.status}')" class="bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded text-xs hover:bg-indigo-100 dark:hover:bg-indigo-800">${icons[r.status] || r.status}</button></td></tr>`;
                  }).join('')}
                </tbody>
              </table>`}
          </div>
        </details>`).join('')}
    </div>`;
  updateSortModeBtn();
}

async function changeAttendanceStatus(recordId, currentStatus) {
  const result = await Swal.fire({ title: 'Change status', input: 'select', inputOptions: { present: '✅ Present', absent: '❌ Absent', late: '⏰ Late', excused: '📝 Excused' }, inputValue: currentStatus, showCancelButton: true, confirmButtonText: 'Save', cancelButtonText: 'Cancel', confirmButtonColor: '#4f46e5' });
  if (!result.isConfirmed || result.value === currentStatus) return;
  showGlobalLoader();
  try {
    const { data, error } = await db.rpc('t_update_status', { p_token: currentTeacher.token, p_record_id: recordId, p_new_status: result.value });
    if (error || !data.ok) return toastError(data?.message || error?.message);
    toastSuccess('Updated'); loadTeacherAttendanceReport();
  } finally { hideGlobalLoader(); }
}

async function exportTeacherAttendanceExcel() {
  if (!currentTeacherAttendanceData) return toastWarning('Load report first');
  const { fromDate, toDate, rows } = currentTeacherAttendanceData;
  const data = [['Date', 'Course', 'Session type / PIN', 'Roll', 'Reg', 'Name', 'Status', 'Time', 'Device']];
  rows.forEach(({ session, records }) => {
    sortStudents(records.map(r => ({ class_roll: r.students?.class_roll || '', reg_no: r.students?.reg_no || '', ...r }))).forEach(r => {
      const dt = r.marked_at ? new Date(r.marked_at) : null;
      data.push([session.date, courseLabel(session.course_code), teacherAttendanceRecordSource(r), r.students?.class_roll || '', r.students?.reg_no || '', r.students?.name || '', r.status, dt ? dt.toLocaleTimeString('en-GB') : '', r.device_id || '']);
    });
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  XLSX.writeFile(wb, `TeacherReport_${fromDate}_to_${toDate}.xlsx`);
}

async function exportTeacherAttendancePDF() {
  if (!currentTeacherAttendanceData) return toastWarning('Load report first');
  const { fromDate, toDate, rows } = currentTeacherAttendanceData;
  const body = [];
  rows.forEach(({ session, records }) => {
    sortStudents(records.map(r => ({ class_roll: r.students?.class_roll || '', ...r }))).forEach(r => {
      const dt = r.marked_at ? new Date(r.marked_at) : null;
      body.push([session.date, courseLabel(session.course_code), teacherAttendanceRecordSource(r), r.students?.class_roll || '-', r.students?.reg_no || '-', r.students?.name || '-', r.status, dt ? dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-', shortDevice(r.device_id)]);
    });
  });
  if (!body.length) return toastWarning('No attendance to export');
  await savePdfA4({ file: `TeacherReport_${fromDate}_to_${toDate}.pdf`, title: 'Teacher Attendance Report', headFill: [20, 184, 166], repeatCols: [0, 1],
    lines: [`Teacher: ${currentTeacher?.name || ''}`, `Period: ${fromDate} to ${toDate}`],
    head: [['Date', 'Course', 'Session type', 'Roll', 'Reg', 'Name', 'Status', 'Time', 'Device']], body });
}

// ============================================================
// MARK ENTRY
// ============================================================
let currentMarkContext = null;

async function loadMarkEntry() {
  const cv = document.getElementById('mkCourse').value;
  const exam = document.getElementById('mkExam').value;
  if (!cv) return toastWarning('Select course');
  if (!exam) return toastWarning('Select exam');
  const [course, year] = cv.split('|');
  if (!year) return toastWarning('Course info incomplete');

  const session_year = parseInt(document.getElementById('mkSY').value, 10);
  if (!session_year) return toastWarning('Select session year');

  showGlobalLoader();
  try {
    let sRaw, sE;
    try { sRaw = await classStudents(year, 'id, name, class_roll, reg_no, session, is_irregular', session_year); } catch (e) { sE = e; }
    if (sE) return toastError(sE.message);
    const students = sortStudents(sRaw || []);
    if (!students.length) { toastWarning('No students'); return; }

    let existing;
    if (currentTeacher?.token) {
      const { data: er } = await db.rpc('t_get_marks', { p_token: currentTeacher.token, p_year: year, p_course_code: course, p_exam_type: exam, p_session_year: session_year });
      existing = (er || []).map(m => ({ student_id: m.student_id, marks: m.mark_value, is_published: m.is_published }));
    } else {
      ({ data: existing } = await db.from('marks').select('student_id, marks, is_published').eq('year', year).eq('session_year', session_year).eq('course_code', course).eq('exam_type', exam));
    }
    const mMap = {};
    let anyPublished = false;
    existing?.forEach(m => { mMap[m.student_id] = m.marks; if (m.is_published) anyPublished = true; });

    currentMarkContext = { course, year, session_year, exam, students, mMap, isPublished: anyPublished };
    const isMobile = window.innerWidth < 768;
    const area = document.getElementById('markEntryArea');
    area.innerHTML = `
      <div class="space-y-3">
        <div class="flex justify-between items-center flex-wrap gap-2">
          <div><p class="font-bold dark:text-white"><span class="num-display">${escapeHtml(course)}</span> · <span class="num-display">${escapeHtml(exam)}</span></p><p class="text-xs text-gray-500 dark:text-gray-400"><span class="num-display">${students.length}</span> students · ${escapeHtml(yearLabel(year))} · <span class="num-display">${session_year}</span></p></div>
          <div class="flex gap-2 flex-wrap">
            <button onclick="downloadMarksTemplate()" class="bg-gray-500 text-white px-4 py-2 rounded-lg btn-pop text-sm">📥 Template</button>
            <button onclick="exportMarksExcel()" class="bg-emerald-600 text-white px-4 py-2 rounded-lg btn-pop text-sm">📊 Excel</button>
            <button onclick="exportMarksPDF()" class="bg-red-600 text-white px-4 py-2 rounded-lg btn-pop text-sm">📄 PDF</button>
          </div>
        </div>
        <div id="publishStatus" class="flex items-center gap-2">
          ${anyPublished ? `<span class="published-badge">✅ Published</span><p class="text-xs text-gray-500 dark:text-gray-400">Locked — Unpublish to edit</p>` : `<span class="draft-badge">📝 Draft</span><p class="text-xs text-gray-500 dark:text-gray-400">Editable</p>`}
        </div>
        <div class="flex gap-2 flex-wrap">
          <button onclick="publishMarks(true)" class="bg-green-600 text-white px-4 py-2 rounded-lg btn-pop text-sm">🔒 Publish</button>
          <button onclick="publishMarks(false)" class="bg-amber-600 text-white px-4 py-2 rounded-lg btn-pop text-sm">🔓 Unpublish</button>
        </div>
        <input type="file" id="marksFile" accept=".xlsx,.xls" class="w-full text-sm dark:text-white">
        <button onclick="importMarksExcel()" class="w-full bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold btn-pop">📊 Excel Import</button>
        <div id="marksGrid"></div>
        <div id="marksStatus" class="text-sm"></div>
      </div>`;
    renderMarksGrid(isMobile ? 'card' : 'grid');
  } finally { hideGlobalLoader(); }
}

function renderMarksGrid(mode) {
  if (!currentMarkContext) return;
  const { students, mMap, isPublished } = currentMarkContext;
  const grid = document.getElementById('marksGrid');
  const disabled = isPublished ? 'disabled' : '';

  if (mode === 'card') {
    grid.innerHTML = `<div class="space-y-2 mt-4">${students.map(s => `<div class="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 p-3 rounded-xl"><div class="flex-1"><p class="font-bold text-sm dark:text-white">${escapeHtml(s.name)}</p><p class="text-xs text-gray-500 dark:text-gray-400">Roll: <span class="num-display">${escapeHtml(s.class_roll)}</span></p></div><input type="number" min="0" max="100" value="${mMap[s.id] ?? ''}" ${disabled} class="mark-input w-20 border-2 rounded-lg p-2 text-center dark:bg-gray-600 dark:text-white dark:border-gray-500 disabled:opacity-50" style="font-family: Arial, sans-serif !important;" data-student-id="${escapeHtml(s.id)}"></div>`).join('')}</div>`;
  } else {
    grid.innerHTML = `<div class="overflow-x-auto max-h-[600px] overflow-y-auto mt-4"><table class="min-w-full text-sm border dark:border-gray-600"><thead class="bg-gray-100 dark:bg-gray-700 sticky top-0"><tr><th class="p-2 border dark:border-gray-600 dark:text-white num-cell">Roll</th><th class="p-2 border dark:border-gray-600 dark:text-white num-cell">Reg</th><th class="p-2 border dark:border-gray-600 dark:text-white text-left">Name</th><th class="p-2 border dark:border-gray-600 dark:text-white">Marks</th></tr></thead><tbody>${students.map(s => `<tr class="marks-grid-row hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-white"><td class="p-2 border dark:border-gray-600 text-center num-cell">${escapeHtml(s.class_roll)}</td><td class="p-2 border dark:border-gray-600 text-center num-cell">${escapeHtml(s.reg_no || '-')}</td><td class="p-2 border dark:border-gray-600">${escapeHtml(s.name)}</td><td class="p-2 border dark:border-gray-600 text-center"><input type="number" min="0" max="100" value="${mMap[s.id] ?? ''}" ${disabled} class="mark-input w-20 border-2 rounded-lg p-2 text-center dark:bg-gray-600 dark:text-white dark:border-gray-500 disabled:opacity-50" style="font-family: Arial, sans-serif !important;" data-student-id="${escapeHtml(s.id)}"></td></tr>`).join('')}</tbody></table></div>`;
  }
  grid.querySelectorAll('.mark-input').forEach(inp => {
    inp.addEventListener('change', () => autoSaveMark(inp));
    inp.addEventListener('blur', () => autoSaveMark(inp));
  });
}

let markSaveTimers = {};
function autoSaveMark(inp) {
  const sid = inp.dataset.studentId;
  if (markSaveTimers[sid]) clearTimeout(markSaveTimers[sid]);
  markSaveTimers[sid] = setTimeout(() => { saveMark(sid, inp.value, inp); }, 800);
}

async function saveMark(studentId, marks, inputEl) {
  if (String(marks).trim() === '') return;
  const ctx = currentMarkContext;
  if (!ctx) return;
  const num = Number(banglaToEnglish(marks));
  if (isNaN(num) || num < 0 || num > 100) {
    if (inputEl) inputEl.style.background = '#fecaca';
    setTimeout(() => { if (inputEl) inputEl.style.background = ''; }, 1500);
    return toastWarning('Marks must be 0-100');
  }
  if (ctx.mMap[studentId] === num) return;
  const { data, error } = await db.rpc('t_save_mark', { p_token: currentTeacher?.token, p_year: ctx.year, p_session_year: ctx.session_year, p_course_code: ctx.course, p_exam_type: ctx.exam, p_student_id: studentId, p_marks: num });
  if (error || !data?.ok) {
    if (inputEl) inputEl.style.background = '#fecaca';
    setTimeout(() => { if (inputEl) inputEl.style.background = ''; }, 1500);
    return toastError(data?.message || error?.message);
  }
  ctx.mMap[studentId] = num;
  if (inputEl) { inputEl.style.background = '#d1fae5'; setTimeout(() => { if (inputEl) inputEl.style.background = ''; }, 800); }
  toastSuccess('Saved');
}

async function publishMarks(publish) {
  const ctx = currentMarkContext;
  if (!ctx) return;
  const ok = await confirmAction(publish ? 'Publish?' : 'Unpublish?', publish ? 'Publishing locks editing.' : 'Unpublishing unlocks editing.', publish ? 'Publish' : 'Unpublish', publish ? '#059669' : '#d97706');
  if (!ok) return;
  showGlobalLoader();
  try {
    const { data: pr, error: prErr } = await db.rpc('t_publish_marks', { p_token: currentTeacher.token, p_year: ctx.year, p_session_year: ctx.session_year, p_course_code: ctx.course, p_exam_type: ctx.exam, p_publish: publish });
    if (prErr || !pr || !pr.ok) return toastError((pr && pr.message) || (prErr && prErr.message) || 'Failed');
    ctx.isPublished = publish;
    toastSuccess(publish ? '✅ Published' : '🔓 Unpublished');
    const status = document.getElementById('publishStatus');
    if (status) {
      status.innerHTML = publish ? `<span class="published-badge">✅ Published</span><p class="text-xs text-gray-500 dark:text-gray-400">Locked</p>` : `<span class="draft-badge">📝 Draft</span><p class="text-xs text-gray-500 dark:text-gray-400">Editable</p>`;
    }
    renderMarksGrid(window.innerWidth < 768 ? 'card' : 'grid');
  } finally { hideGlobalLoader(); }
}

async function downloadMarksTemplate() {
  const ctx = currentMarkContext;
  if (!ctx) return;
  const data = [['Class Roll', 'Reg No', 'Name', ctx.exam]];
  ctx.students.forEach(s => data.push([s.class_roll, s.reg_no || '', s.name, '']));
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Marks');
  XLSX.writeFile(wb, `Marks_${ctx.course}_${ctx.exam}.xlsx`);
}

async function exportMarksExcel() {
  const ctx = currentMarkContext;
  if (!ctx) return;
  const data = [['Class Roll', 'Reg No', 'Name', ctx.exam]];
  ctx.students.forEach(s => data.push([s.class_roll, s.reg_no || '', s.name, ctx.mMap[s.id] ?? '']));
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Marks');
  XLSX.writeFile(wb, `Marks_${ctx.course}_${ctx.exam}.xlsx`);
}

async function exportMarksPDF() {
  const ctx = currentMarkContext;
  if (!ctx) return;
  await savePdfA4({ file: `Marks_${ctx.course}_${ctx.exam}.pdf`, title: `Marks — ${courseLabel(ctx.course)} (${ctx.exam})`, headFill: [139, 92, 246], repeatCols: [0],
    lines: [`Session Year: ${ctx.session_year}   |   Class: ${yearLabel(ctx.year)}`],
    head: [['Roll', 'Reg', 'Name', 'Marks']], body: ctx.students.map(s => [s.class_roll, s.reg_no || '-', s.name, ctx.mMap[s.id] ?? '-']) });
}

async function importMarksExcel() {
  const file = document.getElementById('marksFile')?.files[0];
  if (!file) return toastWarning('Select file');
  const ctx = currentMarkContext;
  if (!ctx) return;
  const status = document.getElementById('marksStatus');
  status.innerHTML = '<p class="text-gray-500">⏳...</p>';
  const map = {};
  ctx.students.forEach(s => { map[s.class_roll] = s.id; });
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      let ok = 0, nf = 0, iv = 0;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; const roll = String(r[0] || '').trim(); const mv = r[3];
        if (!roll) continue;
        const sid = map[roll];
        if (!sid) { nf++; continue; }
        if (mv === '' || mv === undefined || mv === null) continue;
        const num = Number(banglaToEnglish(mv));
        if (isNaN(num) || num < 0 || num > 100) { iv++; continue; }
        const { error } = await db.rpc('t_save_mark', { p_token: currentTeacher?.token, p_year: ctx.year, p_session_year: ctx.session_year, p_course_code: ctx.course, p_exam_type: ctx.exam, p_student_id: sid, p_marks: num });
        if (error) iv++; else { ok++; ctx.mMap[sid] = num; }
      }
      status.innerHTML = `<div class="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-xl"><p class="font-bold text-emerald-700 dark:text-emerald-300 mb-2">✅ Import done</p><p class="text-sm dark:text-white">✓ Success: <span class="num-display">${ok}</span></p><p class="text-sm dark:text-white">✗ Not found: <span class="num-display">${nf}</span></p><p class="text-sm dark:text-white">❌ Invalid: <span class="num-display">${iv}</span></p></div>`;
      renderMarksGrid(window.innerWidth < 768 ? 'card' : 'grid');
    } catch (err) { status.innerHTML = `<p class="text-red-500">❌ ${escapeHtml(err.message)}</p>`; }
  };
  reader.readAsArrayBuffer(file);
}

// ============================================================
// DEVICE TRACKING
// ============================================================
function getTrackingDateFilter() {
  const from = document.getElementById('trackDateFrom')?.value || '';
  const to = document.getElementById('trackDateTo')?.value || '';
  if ((from && !to) || (!from && to)) {
    toastWarning('Select both Date From and Date To, or leave both blank');
    return null;
  }
  if (from && to && from > to) {
    toastWarning('Date From cannot be later than Date To');
    return null;
  }
  const nextDay = to ? new Date(Date.UTC(Number(to.slice(0,4)), Number(to.slice(5,7))-1, Number(to.slice(8,10))+1)).toISOString().slice(0,10) : '';
  return { from, to, nextDay };
}

async function searchByDeviceId() {
  const deviceId = document.getElementById('trackDeviceInput').value.trim();
  if (!deviceId) return toastWarning('Enter Device ID');
  const dateFilter = getTrackingDateFilter();
  if (!dateFilter) return;
  showGlobalLoader();
  try {
    const { data, error } = await db.rpc('t_teacher_tracking_records', {
      p_token: currentTeacher.token,
      p_device_prefix: deviceId,
      p_student_id: null,
      p_from: dateFilter.from || null,
      p_to: dateFilter.to || null
    });
    if (error || !data?.ok) return toastError(data?.message || error?.message || 'Tracking search failed');
    const records = data.records || [];
    if (!records.length) { document.getElementById('trackingResultArea').innerHTML = `<div class="bg-red-50 dark:bg-red-900/30 p-4 rounded-xl text-center"><p class="text-sm text-red-700 dark:text-red-300">❌ No attendance found for this device</p></div>`; return; }
    const uniqueStudents = new Set(records.map(r => r.students?.class_roll)).size;
    const uniqueCourses = new Set(records.map(r => r.attendance_sessions?.course_code)).size;
    const firstDate = records[records.length - 1]?.marked_at;
    const lastDate = records[0]?.marked_at;
    const flags = detectSuspicious(records);
    renderTrackingResult({ type: 'device', title: `Device: ${deviceId}`, records, summary: { totalAttendances: data.count ?? records.length, uniqueStudents, uniqueCourses, firstDate, lastDate }, flags, truncated: data.truncated });
  } finally { hideGlobalLoader(); }
}

async function searchByStudentRoll() {
  const roll = banglaToEnglish(document.getElementById('trackRollInput').value.trim());
  if (!roll) return toastWarning('Enter roll');
  const dateFilter = getTrackingDateFilter();
  if (!dateFilter) return;
  showGlobalLoader();
  try {
    const { data, error } = await db.rpc('t_teacher_tracking_students', {
      p_token: currentTeacher.token,
      p_query: roll
    });
    if (error || !data?.ok) return toastError(data?.message || error?.message || 'Student search failed');
    const students = data.students || [];
    if (!students.length) { document.getElementById('trackingResultArea').innerHTML = `<div class="bg-red-50 dark:bg-red-900/30 p-4 rounded-xl text-center"><p class="text-sm text-red-700 dark:text-red-300">❌ No student with this roll</p></div>`; return; }
    if (students.length > 1) {
      const area = document.getElementById('trackingResultArea');
      area.innerHTML = `<div class="bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-300 dark:border-amber-700 rounded-xl p-4"><h4 class="font-bold text-amber-700 dark:text-amber-300 mb-3">⚠️ ${students.length} students found — pick one</h4><div class="space-y-2">${students.map(s => `<button class="student-pick-btn w-full bg-white dark:bg-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 p-3 rounded-lg text-left transition btn-pop" data-id="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name)}"><div class="flex justify-between items-center"><div><p class="font-bold text-gray-800 dark:text-white">${escapeHtml(s.name)}</p><p class="text-xs text-gray-500 dark:text-gray-400 num-display">Roll: ${escapeHtml(s.class_roll)} · Reg: ${escapeHtml(s.reg_no || '-')}</p></div><div class="text-right"><p class="text-sm font-bold text-indigo-600 dark:text-indigo-300 num-display">${escapeHtml(s.session_year)}</p><p class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(s.year)}</p></div></div></button>`).join('')}</div></div>`;
      area.querySelectorAll('.student-pick-btn').forEach(btn => { btn.addEventListener('click', () => loadStudentTracking(btn.dataset.id, btn.dataset.name)); });
      return;
    }
    await loadStudentTracking(students[0].id, students[0].name);
  } finally { hideGlobalLoader(); }
}

async function loadStudentTracking(studentId, studentName) {
  const dateFilter = getTrackingDateFilter();
  if (!dateFilter) return;
  showGlobalLoader();
  try {
    const { data, error } = await db.rpc('t_teacher_tracking_records', {
      p_token: currentTeacher.token,
      p_device_prefix: null,
      p_student_id: studentId,
      p_from: dateFilter.from || null,
      p_to: dateFilter.to || null
    });
    if (error || !data?.ok) return toastError(data?.message || error?.message || 'Student tracking failed');
    const records = data.records || [];
    if (!records.length) { document.getElementById('trackingResultArea').innerHTML = `<div class="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-xl text-center"><p class="text-sm text-blue-700 dark:text-blue-300">ℹ️ No attendance found for ${escapeHtml(studentName)}</p></div>`; return; }
    const uniqueDevices = new Set(records.map(r => r.device_id)).size;
    const firstDate = records[records.length - 1]?.marked_at;
    const lastDate = records[0]?.marked_at;
    const flags = detectSuspicious(records);
    const student = records[0].students;
    renderTrackingResult({ type: 'student', title: `Student: ${studentName} (Roll: ${student?.class_roll})`, records, summary: { totalAttendances: data.count ?? records.length, uniqueDevices, firstDate, lastDate, student }, flags, truncated: data.truncated });
  } finally { hideGlobalLoader(); }
}

function renderTrackingResult({ type, title, records, summary, flags, truncated = false }) {
  const area = document.getElementById('trackingResultArea');
  let summaryHtml = '';
  if (type === 'device') {
    summaryHtml = `<div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3"><div class="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-xl text-center"><p class="text-xs text-indigo-600 dark:text-indigo-300">Total</p><p class="text-2xl font-bold text-indigo-800 dark:text-indigo-200 num-display">${summary.totalAttendances}</p></div><div class="bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-xl text-center"><p class="text-xs text-emerald-600 dark:text-emerald-300">Unique students</p><p class="text-2xl font-bold text-emerald-800 dark:text-emerald-200 num-display">${summary.uniqueStudents}</p></div><div class="bg-cyan-50 dark:bg-cyan-900/30 p-3 rounded-xl text-center"><p class="text-xs text-cyan-600 dark:text-cyan-300">Unique courses</p><p class="text-2xl font-bold text-cyan-800 dark:text-cyan-200 num-display">${summary.uniqueCourses}</p></div><div class="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-xl text-center"><p class="text-xs text-amber-600 dark:text-amber-300">Date range</p><p class="text-xs font-bold text-amber-800 dark:text-amber-200 num-display">${summary.firstDate ? new Date(summary.firstDate).toLocaleDateString('en-GB') : '-'}<br>→<br>${summary.lastDate ? new Date(summary.lastDate).toLocaleDateString('en-GB') : '-'}</p></div></div>`;
  } else {
    summaryHtml = `<div class="grid grid-cols-3 gap-2 mb-3"><div class="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-xl text-center"><p class="text-xs text-indigo-600 dark:text-indigo-300">Total</p><p class="text-2xl font-bold text-indigo-800 dark:text-indigo-200 num-display">${summary.totalAttendances}</p></div><div class="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-xl text-center"><p class="text-xs text-purple-600 dark:text-purple-300">Devices used</p><p class="text-2xl font-bold text-purple-800 dark:text-purple-200 num-display">${summary.uniqueDevices}</p></div><div class="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-xl text-center"><p class="text-xs text-amber-600 dark:text-amber-300">Date range</p><p class="text-xs font-bold text-amber-800 dark:text-amber-200 num-display">${summary.firstDate ? new Date(summary.firstDate).toLocaleDateString('en-GB') : '-'}<br>→<br>${summary.lastDate ? new Date(summary.lastDate).toLocaleDateString('en-GB') : '-'}</p></div></div>`;
  }

  const truncatedHtml = truncated ? '<div class="bg-amber-50 dark:bg-amber-900/30 border border-amber-300 rounded-lg p-2 text-sm text-amber-800 dark:text-amber-200">Showing the latest 500 records only. Narrow the date range for a complete view.</div>' : '';

  let flagsHtml = '';
  if (flags && flags.length > 0) {
    flagsHtml = `<div class="bg-red-50 dark:bg-red-900/30 border-2 border-red-300 dark:border-red-700 p-3 rounded-xl mb-3"><p class="font-bold text-red-700 dark:text-red-300 mb-2">🚩 Suspicious activity</p>${flags.map(f => `<div class="bg-white dark:bg-gray-700 p-2 rounded-lg mb-1"><span class="suspicious-flag">${f.type === 'many_students' ? '👥' : '⚡'}</span><span class="text-sm dark:text-white ml-2">${escapeHtml(f.message)}</span></div>`).join('')}</div>`;
  }

  const tableHtml = `<div class="overflow-x-auto max-h-[500px] overflow-y-auto"><table class="min-w-full text-xs border dark:border-gray-600"><thead class="bg-gray-100 dark:bg-gray-700 sticky top-0"><tr><th class="p-2 border dark:border-gray-600 dark:text-white">Date</th><th class="p-2 border dark:border-gray-600 dark:text-white">Time</th><th class="p-2 border dark:border-gray-600 dark:text-white">Student</th><th class="p-2 border dark:border-gray-600 dark:text-white">Course</th><th class="p-2 border dark:border-gray-600 dark:text-white">Device</th><th class="p-2 border dark:border-gray-600 dark:text-white">Status</th></tr></thead><tbody>${records.map(r => { const stIcons = { present: '✅', absent: '❌', late: '⏰', excused: '📝' }; const dt = r.marked_at ? new Date(r.marked_at) : null; return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-white"><td class="p-2 border dark:border-gray-600 text-center num-display">${dt ? dt.toLocaleDateString('en-GB') : '-'}</td><td class="p-2 border dark:border-gray-600 text-center num-display">${dt ? dt.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) : '-'}</td><td class="p-2 border dark:border-gray-600">${escapeHtml(r.students?.name || '-')} <span class="text-xs text-gray-500 num-display">(${escapeHtml(r.students?.class_roll || '-')})</span></td><td class="p-2 border dark:border-gray-600 text-center num-display">${escapeHtml(r.attendance_sessions?.course_code ? courseLabel(r.attendance_sessions.course_code) : '-')}</td><td class="p-2 border dark:border-gray-600 text-center"><span class="device-badge">${shortDevice(r.device_id)}</span></td><td class="p-2 border dark:border-gray-600 text-center">${stIcons[r.status] || r.status}</td></tr>`; }).join('')}</tbody></table></div>`;

  area.innerHTML = `<div class="bg-white dark:bg-gray-700 border-2 border-orange-200 dark:border-orange-700 rounded-xl p-4 space-y-3"><h4 class="font-bold text-orange-700 dark:text-orange-300">🔍 ${escapeHtml(title)}</h4>${summaryHtml}${truncatedHtml}${flagsHtml}<p class="text-xs text-gray-500 dark:text-gray-400">${records.length} records shown</p>${tableHtml}<div class="flex gap-2 mt-3"><button onclick="exportTrackingExcel()" class="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-bold btn-pop text-sm">📊 Excel</button><button onclick="exportTrackingPDF()" class="flex-1 bg-red-600 text-white py-2 rounded-lg font-bold btn-pop text-sm">📄 PDF</button></div></div>`;
  window.currentTrackingData = { type, title, records, summary, flags };
}

async function exportTrackingExcel() {
  const data = window.currentTrackingData;
  if (!data) return toastWarning('Search first');
  const rows = [['Date', 'Time', 'Student', 'Roll', 'Course', 'Device', 'Status']];
  data.records.forEach(r => {
    const dt = r.marked_at ? new Date(r.marked_at) : null;
    rows.push([dt ? dt.toLocaleDateString('en-GB') : '', dt ? dt.toLocaleTimeString('en-GB') : '', r.students?.name || '', r.students?.class_roll || '', r.attendance_sessions?.course_code || '', r.device_id || '', r.status]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Tracking');
  XLSX.writeFile(wb, `Tracking_${Date.now()}.xlsx`);
}

async function exportTrackingPDF() {
  const data = window.currentTrackingData;
  if (!data) return toastWarning('Search first');
  await savePdfA4({ file: `Tracking_${Date.now()}.pdf`, title: 'Device Tracking Report', headFill: [245, 158, 11], repeatCols: [0, 1],
    lines: [data.title],
    head: [['Date', 'Time', 'Student', 'Roll', 'Course', 'Device', 'Status']],
    body: data.records.map(r => { const dt = r.marked_at ? new Date(r.marked_at) : null; return [dt ? dt.toLocaleDateString('en-GB') : '-', dt ? dt.toLocaleTimeString('en-GB') : '-', r.students?.name || '-', r.students?.class_roll || '-', r.attendance_sessions?.course_code || '-', shortDevice(r.device_id), r.status]; }) });
}
