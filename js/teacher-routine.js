/* js/teacher-routine.js — শিক্ষকের রুটিন + আজকের সারাংশ */
// ============================================================
// TEACHER ROUTINE: my weekly routine + today's full schedule
// ============================================================
let teacherRoutineView = 'mine';
let todayRoutineCache = null;
let teacherWaCol = false;
const ROOM_RE = /^[A-Za-z0-9][A-Za-z0-9 \/-]{0,19}$/;
let todayOnlyMine = false;
let todayYear = '';

function parseSlotEndMinutes(slot) {
  const m = String(slot || '').match(/-\s*(\d{1,2})[.:](\d{2})/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  if (h < 8) h += 12;
  return h * 60 + parseInt(m[2], 10);
}

function slotStatus(slot, nowMin) {
  const st = parseSlotStartMinutes(slot), en = parseSlotEndMinutes(slot);
  if (st === null || en === null) return 'upcoming';
  if (nowMin < st) return 'upcoming';
  return nowMin < en ? 'ongoing' : 'done';
}

function routineSegHtml(view) {
  const b = (v, label) => `<button onclick="loadTeacherRoutineView('${v}')" class="seg-btn ${view === v ? 'active' : ''}">${label}</button>`;
  return `<div class="seg">${b('mine', '📅 My Routine')}${b('today', '🗓️ Today\u2019s Classes')}</div>`;
}

async function loadTeacherRoutineView(view) {
  teacherRoutineView = view === 'today' ? 'today' : 'mine';
  if (liveReportInterval) { clearInterval(liveReportInterval); liveReportInterval = null; }
  const el = document.getElementById('teacherContent');
  if (!el || !currentTeacher) return;
  el.innerHTML = '<p class="text-center text-gray-500 py-8">⏳ Loading...</p>';
  try {
    if (teacherRoutineView === 'today') {
      const bd = getBangladeshNow();
      const raw = await fetchRoutineData({ day: bd.day });
      const list = sortRoutineData(await enrichRoutineData(raw));
      todayRoutineCache = { bd, list };
      renderTodayRoutine(true);
      liveReportInterval = setInterval(() => renderTodayRoutine(false), 60000);
      return;
    }
    const raw = await fetchRoutineData({ teacherId: currentTeacher.id });
    const sorted = sortRoutineData(await enrichRoutineData(raw));
    currentRoutineData = sorted;
    currentRoutineContext = { view: 'teacher', teacherId: currentTeacher.id, filterInfo: `Teacher: ${currentTeacher.name}` };
    if (!sorted.length) {
      el.innerHTML = routineSegHtml('mine') + '<div class="bg-gray-50 dark:bg-gray-700 rounded-xl p-8 text-center"><p class="text-4xl mb-2">📭</p><p class="text-gray-500 dark:text-gray-400">No routine assigned</p><p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Ask the admin to add day & time in Mapping</p></div>';
      return;
    }
    el.innerHTML = `
      ${routineSegHtml('mine')}
      <div class="flex justify-between items-center flex-wrap gap-2 mb-3">
        <h3 class="text-lg font-bold dark:text-white">📅 My Class Routine</h3>
        <div class="flex gap-2">
          <button onclick="exportRoutineExcel()" class="bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-bold btn-pop">📊 Excel</button>
          <button onclick="exportRoutinePDF()" class="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-bold btn-pop">📄 PDF</button>
        </div>
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">Total <span class="num-display">${sorted.length}</span> classes · auto-synced from admin mapping</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${renderRoutineCards(sorted, { showTeacher: false, showSession: true })}</div>`;
  } catch (err) {
    el.innerHTML = `<div class="bg-red-50 dark:bg-red-900/30 p-4 rounded-xl text-center"><p class="text-red-500 mb-2">❌ ${escapeHtml(err.message || 'Load failed')}</p><button onclick="loadTeacherRoutineView('${teacherRoutineView}')" class="bg-lime-600 text-white px-4 py-2 rounded-xl font-bold btn-pop">🔄 Retry</button></div>`;
  }
}

function setTodayFilter(kind, value) {
  if (kind === 'mine') todayOnlyMine = !!value; else todayYear = value || '';
  renderTodayRoutine(true);
}

function renderTodayRoutine(force) {
  const el = document.getElementById('teacherContent');
  if (!el || !todayRoutineCache || !currentTeacher) return;
  if (!force && !document.getElementById('todayRoutineRoot')) return;
  const { bd, list } = todayRoutineCache;
  const nowMin = getBangladeshNow().minutes;
  const isMine = r => String(r.teacher_id) === String(currentTeacher.id);
  const years = [...new Set(list.map(r => r.year))];
  if (todayYear && !years.includes(todayYear)) todayYear = '';
  const shown = list.filter(r => (!todayOnlyMine || isMine(r)) && (!todayYear || r.year === todayYear));
  currentRoutineData = shown;
  const dateLabel = new Date(bd.dateStr + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  currentRoutineContext = { view: 'teacher-today', filterInfo: `Today · ${dateLabel}${todayOnlyMine ? ' · My classes' : ' · All teachers'}${todayYear ? ' · ' + todayYear : ''}` };

  const ongoing = shown.filter(r => slotStatus(r.time_slot, nowMin) === 'ongoing').length;
  const slots = {};
  shown.forEach(r => { (slots[r.time_slot] = slots[r.time_slot] || []).push(r); });
  const labels = { ongoing: '● Ongoing now', upcoming: 'Upcoming', done: 'Finished' };
  const body = Object.keys(slots).sort((a, b) => routineTimeRank(a) - routineTimeRank(b)).map(slot => {
    const st = slotStatus(slot, nowMin);
    return `<div class="today-slot ${st}">
      <div class="slot-time"><span class="num-display">${escapeHtml(slot)}</span><span class="slot-status">${labels[st]}</span></div>
      <div class="flex-1 min-w-0">${slots[slot].map(r => `<div class="today-item ${isMine(r) ? 'mine' : ''}">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <b class="text-sm dark:text-white break-words">${escapeHtml(courseLabel(r.course_code, r.course_name))}</b>
          <span class="flex gap-1 items-center">${r.room ? `<span class="chip chip-day">🚪 ${escapeHtml(r.room)}</span>` : ''}${isMine(r) ? '<span class="chip bg-indigo-600 text-white">You</span>' : ''}<span class="chip bg-gray-100 text-gray-600 num-display">${escapeHtml(yearLabel(r.year))}</span></span>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">👨‍🏫 ${escapeHtml(r.teacher_name)}</p>
      </div>`).join('')}</div>
    </div>`;
  }).join('');

  el.innerHTML = `<div id="todayRoutineRoot">
    ${routineSegHtml('today')}
    <div class="flex justify-between items-start flex-wrap gap-2 mb-3">
      <div><h3 class="text-lg font-bold dark:text-white">🗓️ Today\u2019s Classes</h3><p class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(dateLabel)} · auto-refreshes every minute</p></div>
      <div class="flex gap-2">
        <button onclick="exportRoutineExcel()" class="bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-bold btn-pop">📊 Excel</button>
        <button onclick="exportRoutinePDF()" class="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-bold btn-pop">📄 PDF</button>
      </div>
    </div>
    <div class="grid grid-cols-3 gap-2 mb-3 text-center">
      <div class="bg-indigo-50 dark:bg-indigo-900/30 rounded-xl p-2"><p class="text-xl font-extrabold text-indigo-600 dark:text-indigo-300 num-display">${list.length}</p><p class="text-[10px] font-semibold text-gray-500 dark:text-gray-400">All classes</p></div>
      <div class="bg-purple-50 dark:bg-purple-900/30 rounded-xl p-2"><p class="text-xl font-extrabold text-purple-600 dark:text-purple-300 num-display">${list.filter(isMine).length}</p><p class="text-[10px] font-semibold text-gray-500 dark:text-gray-400">Mine</p></div>
      <div class="bg-emerald-50 dark:bg-emerald-900/30 rounded-xl p-2"><p class="text-xl font-extrabold text-emerald-600 dark:text-emerald-300 num-display">${ongoing}</p><p class="text-[10px] font-semibold text-gray-500 dark:text-gray-400">Ongoing</p></div>
    </div>
    <div class="flex gap-2 items-center flex-wrap mb-4">
      <label class="flex items-center gap-2 text-sm font-semibold dark:text-white"><input type="checkbox" ${todayOnlyMine ? 'checked' : ''} onchange="setTodayFilter('mine', this.checked)"> Only my classes</label>
      <select onchange="setTodayFilter('year', this.value)" class="border-2 rounded-xl px-3 py-1.5 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"><option value="">All years</option>${years.map(y => `<option ${y === todayYear ? 'selected' : ''}>${escapeHtml(y)}</option>`).join('')}</select>
    </div>
    ${shown.length ? body : '<div class="bg-gray-50 dark:bg-gray-700 rounded-xl p-8 text-center"><p class="text-4xl mb-2">🌿</p><p class="text-gray-500 dark:text-gray-400">No classes scheduled for today</p></div>'}
  </div>`;
}

// flush (not drop) pending mark auto-saves when leaving a tab
function flushPendingMarkSaves() {
  try {
    Object.keys(markSaveTimers).forEach(sid => {
      clearTimeout(markSaveTimers[sid]);
      const inp = document.querySelector(`input[data-student-id="${CSS.escape(String(sid))}"]`);
      if (inp && String(inp.value).trim() !== '') saveMark(sid, inp.value, inp);
    });
    markSaveTimers = {};
  } catch (e) { console.warn('flush marks', e); }
}

function markActiveTab(containerId, tab) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.querySelectorAll('button').forEach(b => b.classList.toggle('active', (b.getAttribute('onclick') || '').includes("'" + tab + "'")));
}
const _origShowAdminTab = showAdminTab;
showAdminTab = async function (tab) { markActiveTab('adminTabs', tab); return _origShowAdminTab(tab); };
const _origShowTeacherTab = showTeacherTab;
showTeacherTab = async function (tab) { flushPendingMarkSaves(); markActiveTab('teacherTabsDesktop', tab); return _origShowTeacherTab(tab); };

// ============================================================
// TODAY SUMMARY (teacher panel) — আজকের সব শিক্ষকের ক্লাস, Year → Course → Teacher
// নতুন RPC: t_today_summary, t_session_students (পুরনো কোড অপরিবর্তিত)
// ============================================================
let tsOpenIds = new Set();
const _origShowTeacherTabTS = showTeacherTab;
showTeacherTab = async function (tab) {
  if (tab === 'todaySummary') {
    flushPendingMarkSaves();
    if (pinTimerInterval) { clearInterval(pinTimerInterval); pinTimerInterval = null; }
    if (liveReportInterval) { clearInterval(liveReportInterval); liveReportInterval = null; }
    closeMoreMenu();
    markActiveTab('teacherTabsDesktop', tab);
    return tsRender(true);
  }
  return _origShowTeacherTabTS(tab);
};

function tsTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' });
}

async function tsRender(first) {
  const el = document.getElementById('teacherContent');
  if (!el || !currentTeacher) return;
  if (first) {
    tsOpenIds = new Set();
    el.innerHTML = `<div class="space-y-4">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <h3 class="text-lg font-bold dark:text-white">📋 Today Summary</h3>
        <button onclick="tsRender(false)" class="bg-indigo-600 text-white px-3 py-2 rounded-xl text-sm font-bold btn-pop">🔄 Refresh</button>
      </div>
      <p id="tsMeta" class="text-xs text-gray-500 dark:text-gray-400">⏳ Loading...</p>
      <div id="tsBody"></div></div>`;
    liveReportInterval = setInterval(() => {
      if (document.getElementById('tsBody')) tsRender(false);
      else { clearInterval(liveReportInterval); liveReportInterval = null; }
    }, 60000);
  }
  const body = document.getElementById('tsBody'), meta = document.getElementById('tsMeta');
  if (!body) return;
  try {
    await getCourseInfoMap();
    const { data, error } = await db.rpc('t_today_summary', { p_token: currentTeacher.token });
    if (error || !data || !data.ok) {
      body.innerHTML = `<p class="text-red-500 text-center py-4">❌ ${escapeHtml(data?.message || error?.message || 'Could not load')}</p>`;
      if (meta) meta.textContent = '';
      return;
    }
    tsPaint(data, body, meta);
    for (const id of Array.from(tsOpenIds)) {
      const box = document.getElementById('tsv-' + id);
      if (box) { box.classList.remove('hidden'); tsLoadStudents(id); } else tsOpenIds.delete(id);
    }
  } catch (err) {
    body.innerHTML = `<p class="text-red-500 text-center py-4">❌ ${escapeHtml(err.message || String(err))}</p>`;
  }
}

function tsPaint(data, body, meta) {
  const sessions = data.sessions || [], scheduled = data.scheduled || [];
  const now = new Date();
  const isRunning = s => s.is_active && s.expires_at && new Date(s.expires_at) > now;
  const held = sessions.filter(s => s.total > 0).length;
  const running = sessions.filter(isRunning).length;
  const bd = getBangladeshNow();
  const lateSched = scheduled.filter(x => { const st = parseSlotStartMinutes(x.time_slot); return st !== null && bd.minutes >= st + 15; }).length;
  if (meta) meta.textContent = `${data.day}, ${data.date} · updated ${tsTime(new Date().toISOString())} · auto-refresh every 1 min`;

  const chip = (txt, cls) => `<span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${cls}">${txt}</span>`;
  const stat = (label, val, cls) => `<div class="${cls} p-2 rounded-lg text-center"><p class="text-[11px] font-bold">${label}</p><p class="text-xl font-bold num-display">${val}</p></div>`;
  let html = `<div class="grid grid-cols-3 gap-2 mb-4">
    ${stat('✅ Held', held, 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200')}
    ${stat('🟢 Running', running, 'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200')}
    ${stat('⚠️ Not started', lateSched, 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200')}
  </div>`;

  // গ্রুপ: Year (class + session_year) → সেশনগুলো (Course, Teacher)
  const groups = {};
  sessions.forEach(s => { const k = s.year + '|' + s.session_year; (groups[k] = groups[k] || { year: s.year, sy: s.session_year, list: [] }).list.push(s); });
  const gKeys = Object.keys(groups);
  if (!gKeys.length) html += '<p class="text-gray-400 text-center py-4">No class has started today yet</p>';
  gKeys.forEach(k => {
    const g = groups[k];
    html += `<div class="mb-4"><h4 class="font-bold dark:text-white mb-2">🎓 ${escapeHtml(yearLabel(g.year))} · Session <span class="num-display">${escapeHtml(g.sy)}</span></h4><div class="space-y-2">`;
    g.list.sort((a, b) => String(a.course_code).localeCompare(String(b.course_code)) || String(a.created_at).localeCompare(String(b.created_at)));
    g.list.forEach(s => {
      const present = (s.present || 0) + (s.late || 0);
      const status = isRunning(s) ? chip('🟢 Running', 'bg-blue-100 text-blue-800') : (s.total > 0 ? chip('✅ Held', 'bg-emerald-100 text-emerald-800') : chip('⚪ No attendance', 'bg-gray-200 text-gray-700'));
      html += `<div class="bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl p-3">
        <div class="flex items-start justify-between gap-2 flex-wrap">
          <div><p class="font-bold dark:text-white">📚 ${escapeHtml(courseLabel(s.course_code))}</p>
          <p class="text-sm text-gray-600 dark:text-gray-300">👨‍🏫 ${escapeHtml(s.teacher_name || '-')} · 🕒 <span class="num-display">${escapeHtml(tsTime(s.created_at))}</span></p></div>
          ${status}
        </div>
        <div class="flex items-center justify-between mt-2 gap-2 flex-wrap">
          <p class="text-sm dark:text-white">✅ <b class="num-display">${present}</b> / <span class="num-display">${s.class_size || 0}</span> present${s.absent ? ` · ❌ <span class="num-display">${s.absent}</span>` : ''}</p>
          <button onclick="tsToggleView('${s.id}')" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold btn-pop">👁 View</button>
        </div>
        <div id="tsv-${s.id}" class="hidden mt-3"></div>
      </div>`;
    });
    html += '</div></div>';
  });

  // রুটিন অনুযায়ী আজ ক্লাস থাকার কথা, কিন্তু এখনো শুরু হয়নি
  if (scheduled.length) {
    const rows = scheduled.slice().sort((a, b) => (parseSlotStartMinutes(a.time_slot) ?? 9999) - (parseSlotStartMinutes(b.time_slot) ?? 9999));
    html += `<div class="mt-2"><h4 class="font-bold dark:text-white mb-1">⚠️ Scheduled today — class not started yet</h4>
      <p class="text-[11px] text-gray-500 dark:text-gray-400 mb-2">Based on the routine entered so far (some routines may still be missing).</p><div class="space-y-2">`;
    rows.forEach(x => {
      const st = parseSlotStartMinutes(x.time_slot);
      let tag, cls;
      if (st !== null && bd.minutes >= st + 15) { tag = '⚠️ Not started'; cls = 'border-red-300 bg-red-50 dark:bg-red-900/30'; }
      else if (st !== null && bd.minutes >= st) { tag = '⏳ Time has begun'; cls = 'border-amber-300 bg-amber-50 dark:bg-amber-900/30'; }
      else { tag = '🕘 Upcoming'; cls = 'border-gray-200 bg-gray-50 dark:bg-gray-700'; }
      html += `<div class="border-2 ${cls} rounded-xl p-3 dark:text-white">
        <div class="flex items-start justify-between gap-2 flex-wrap">
          <div><p class="font-bold">📚 ${escapeHtml(courseLabel(x.course_code))} <span class="text-xs font-normal">· ${escapeHtml(yearLabel(x.year))}</span></p>
          <p class="text-sm">👨‍🏫 ${escapeHtml(x.teacher_name || '-')} · 🕒 <span class="num-display">${escapeHtml(x.time_slot || '-')}</span>${x.room ? ` · Room ${escapeHtml(x.room)}` : ''}</p></div>
          <span class="text-xs font-bold">${tag}</span>
        </div></div>`;
    });
    html += '</div></div>';
  }
  body.innerHTML = html;
}

async function tsToggleView(id) {
  const box = document.getElementById('tsv-' + id);
  if (!box) return;
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); tsOpenIds.delete(id); return; }
  tsOpenIds.add(id);
  box.classList.remove('hidden');
  await tsLoadStudents(id);
}

async function tsLoadStudents(id) {
  const box = document.getElementById('tsv-' + id);
  if (!box) return;
  if (!box.innerHTML) box.innerHTML = '<p class="text-center text-sm dark:text-gray-300">⏳...</p>';
  const { data, error } = await db.rpc('t_session_students', { p_token: currentTeacher.token, p_session_id: id });
  if (error || !data || !data.ok) { box.innerHTML = `<p class="text-red-500 text-sm">❌ ${escapeHtml(data?.message || error?.message || 'Could not load')}</p>`; return; }
  const recs = sortStudents((data.records || []).map(r => ({ ...r, class_roll: r.class_roll || '' })));
  if (!recs.length) { box.innerHTML = '<p class="text-gray-400 text-sm text-center">No attendance recorded yet</p>'; return; }
  const icons = { present: '✅', absent: '❌', late: '⏰', excused: '📝' };
  const cnt = st => recs.filter(r => r.status === st).length;
  const th = 'p-2 border dark:border-gray-600 dark:text-white';
  box.innerHTML = `<p class="text-xs mb-2 dark:text-white">✅ ${cnt('present')} · ⏰ ${cnt('late')} · ❌ ${cnt('absent')} · 📝 ${cnt('excused')}</p>
    <div class="overflow-x-auto max-h-80 overflow-y-auto"><table class="min-w-full text-xs border dark:border-gray-600">
    <thead class="bg-gray-100 dark:bg-gray-600 sticky top-0"><tr><th class="${th} num-cell">Roll</th><th class="${th} num-cell">Reg</th><th class="${th} text-left">Name</th><th class="${th}">Status</th><th class="${th}">Time</th></tr></thead>
    <tbody>${recs.map(r => `<tr class="dark:text-white"><td class="p-2 border dark:border-gray-600 text-center num-cell">${escapeHtml(r.class_roll || '-')}</td><td class="p-2 border dark:border-gray-600 text-center num-cell">${escapeHtml(r.reg_no || '-')}</td><td class="p-2 border dark:border-gray-600">${escapeHtml(r.name || '-')}${r.is_irregular ? ' <span class="text-[10px] text-amber-600">(I)</span>' : ''}</td><td class="p-2 border dark:border-gray-600 text-center">${icons[r.status] || ''} ${escapeHtml(r.status)}</td><td class="p-2 border dark:border-gray-600 text-center num-cell">${escapeHtml(tsTime(r.marked_at))}</td></tr>`).join('')}</tbody></table></div>`;
}

(function cleanPinCache() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith('amc_last_session_')).forEach(k => {
      try { const x = JSON.parse(localStorage.getItem(k)); if (!x || !x.expires_at || new Date(x.expires_at) <= new Date()) localStorage.removeItem(k); }
      catch (e) { localStorage.removeItem(k); }
    });
  } catch (e) {}
})();
