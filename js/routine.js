/* js/routine.js — Course info + রুটিন সংক্রান্ত সাধারণ ফাংশন */
// ============================================================
// COURSE INFO HELPERS
// ============================================================
let courseInfoCache = null;
let courseInfoLoadedAt = 0;

async function getCourseInfoMap(force = false) {
  if (!force && courseInfoCache && (Date.now() - courseInfoLoadedAt) < 120000) return courseInfoCache;
  const map = {};
  try {
    const { data: oldC } = await db.from('courses').select('course_code, course_name');
    (oldC || []).forEach(c => {
      const k = String(c.course_code || '').trim().toUpperCase();
      if (k && c.course_name) map[k] = { name: c.course_name, short: '' };
    });
  } catch (e) { console.warn('courses load', e); }
  try {
    const { data: newC } = await db.from('courses_new').select('course_code, course_name, short_code');
    (newC || []).forEach(c => {
      const k = String(c.course_code || '').trim().toUpperCase();
      if (!k) return;
      map[k] = { name: c.course_name || (map[k] && map[k].name) || '', short: c.short_code || '' };
    });
  } catch (e) { console.warn('courses_new load', e); }
  courseInfoCache = map;
  courseInfoLoadedAt = Date.now();
  return map;
}
function invalidateCourseInfo() { courseInfoCache = null; courseInfoLoadedAt = 0; }

function courseInfo(code) {
  const k = String(code || '').trim().toUpperCase();
  return (courseInfoCache && courseInfoCache[k]) || { name: '', short: '' };
}
function courseShortOrName(code, fallbackName) {
  const i = courseInfo(code);
  return i.short || i.name || fallbackName || '';
}
function courseLabel(code, fallbackName) {
  const n = courseShortOrName(code, fallbackName);
  return n ? `${code} - ${n}` : String(code || '');
}

// ============================================================
// SHARED ROUTINE HELPERS
// ============================================================
const ROUTINE_TIME_ORDER = ['9.00-9.45','9.45-10.30','10.30-11.15','11.15-12.00','12.00-12.45','12.45-1.30','1.30-2.00 (Tifin)','2.00-2.45','2.45-3.30'];
const ROUTINE_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function routineTimeRank(t) {
  const i = ROUTINE_TIME_ORDER.indexOf(t);
  return i === -1 ? 99 : i;
}

async function fetchRoutineData(filters = {}) {
  let q = db.from('teacher_courses')
    .select('*, teachers(name)')
    .not('class_day', 'is', null)
    .not('time_slot', 'is', null);
  if (filters.day) q = q.eq('class_day', filters.day);
  if (filters.year) q = q.eq('year', filters.year);
  if (filters.teacherId) q = q.eq('teacher_id', filters.teacherId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function enrichRoutineData(rawRoutines) {
  if (!rawRoutines || !rawRoutines.length) return [];
  await getCourseInfoMap();
  const seen = new Set(), out = [];
  rawRoutines.forEach(r => {
    const k = [r.class_day, r.time_slot, r.course_code, r.teacher_id, r.year].join('|');
    if (seen.has(k)) return;
    seen.add(k);
    const i = courseInfo(r.course_code);
    out.push({ ...r, course_name: i.name || i.short || '', teacher_name: r.teachers?.name || 'Unknown' });
  });
  return out;
}

function sortRoutineData(routines) {
  const weekOrder = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  return routines.slice().sort((a, b) => {
    const dA = weekOrder[a.class_day] ?? 99;
    const dB = weekOrder[b.class_day] ?? 99;
    if (dA !== dB) return dA - dB;
    return routineTimeRank(a.time_slot) - routineTimeRank(b.time_slot);
  });
}

function renderRoutineCards(routines, options = {}) {
  const { showTeacher = true, showSession = true } = options;
  if (!routines.length) {
    return `<div class="col-span-full bg-gray-50 dark:bg-gray-700 rounded-xl p-8 text-center">
      <p class="text-4xl mb-2">📭</p>
      <p class="text-gray-500 dark:text-gray-400">No routine found for this filter</p>
    </div>`;
  }
  const grouped = {};
  routines.forEach(r => {
    if (!grouped[r.class_day]) grouped[r.class_day] = [];
    grouped[r.class_day].push(r);
  });

  return Object.entries(grouped).map(([day, items]) => `
    <div class="routine-day-card bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600">
      <div class="bg-gradient-to-r from-purple-500 to-indigo-600 px-4 py-2.5 flex justify-between items-center">
        <h4 class="font-bold text-white">${escapeHtml(day)}</h4>
        <span class="text-xs text-white bg-white/20 px-2 py-0.5 rounded-full num-display">${items.length}</span>
      </div>
      <div class="divide-y divide-gray-200 dark:divide-gray-700">
        ${items.map(r => `
          <div class="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/70 dark:text-indigo-300 px-2 py-0.5 rounded text-xs font-bold num-display whitespace-nowrap">${escapeHtml(r.time_slot)}</span>
                  <span class="font-bold text-sm dark:text-white break-words">${escapeHtml(courseLabel(r.course_code, r.course_name))}</span>${r.room ? `<span class="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">🚪 ${escapeHtml(r.room)}</span>` : ''}
                </div>
                ${showTeacher ? `<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">👨‍🏫 ${escapeHtml(r.teacher_name)}</p>` : ''}
              </div>
              ${showSession ? `<div class="text-right whitespace-nowrap"><span class="bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-1 rounded text-xs num-display">${escapeHtml(yearLabel(r.year))}</span></div>` : ''}
            </div>
          </div>`).join('')}
      </div>
    </div>
  `).join('');
}

async function loadRoutineTeachers() {
  const sel = document.getElementById('rvTeacher');
  if (!sel) return;
  try {
    const { data: dir } = await db.rpc('get_teacher_directory');
    const data = (dir || []).filter(t => t.is_active);
    sel.innerHTML = '<option value="">All Teachers</option>' +
      (data || []).map(t => `<option value="${attrEsc(t.id)}">${escapeHtml(t.name)}</option>`).join('');
  } catch (e) { console.warn('routine teachers', e); }
}

async function loadRoutineViewer() {
  const day = document.getElementById('rvDay')?.value || '';
  const year = document.getElementById('rvYear')?.value || '';
    const teacherId = document.getElementById('rvTeacher')?.value || '';

  const area = document.getElementById('routineViewerArea');
  if (!area) return;
  area.innerHTML = `<div class="flex flex-col items-center justify-center py-10 gap-3">
    <div class="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
    <p class="text-gray-500 dark:text-gray-400 text-sm">Loading routine...</p>
  </div>`;

  try {
    const raw = await fetchRoutineData({ day, year, teacherId });
    if (!raw.length) {
      area.innerHTML = renderRoutineCards([], {});
      currentRoutineData = null;
      currentRoutineContext = null;
      return;
    }
    const enriched = await enrichRoutineData(raw);
    const sorted = sortRoutineData(enriched);

    currentRoutineData = sorted;
    currentRoutineContext = {
      view: 'admin',
      day, year, teacherId,
      filterInfo: buildRoutineFilterInfo({ day, year, teacherId })
    };

    area.innerHTML = `<div class="mb-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl p-3">
      <p class="text-sm text-purple-700 dark:text-purple-300">📊 <b>${sorted.length}</b> classes · ${escapeHtml(currentRoutineContext.filterInfo)}</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${renderRoutineCards(sorted, { showTeacher: true, showSession: true })}
    </div>`;
  } catch (err) {
    area.innerHTML = `<div class="bg-red-50 dark:bg-red-900/30 p-4 rounded-xl text-center">
      <p class="text-red-500 mb-2">❌ ${escapeHtml(err.message || 'Load failed')}</p>
      <button onclick="loadRoutineViewer()" class="bg-purple-600 text-white px-4 py-2 rounded-xl font-bold btn-pop">🔄 Retry</button>
    </div>`;
    currentRoutineData = null;
  }
}

function buildRoutineFilterInfo({ day, year, teacherId }) {
  const parts = [];
  if (day) parts.push(day);
  if (year) parts.push(year);
  if (teacherId) {
    const sel = document.getElementById('rvTeacher');
    const name = sel?.options[sel.selectedIndex]?.text || '';
    if (name) parts.push('Teacher: ' + name);
  }
  return parts.length ? parts.join(' · ') : 'All classes';
}

async function exportRoutineExcel() {
  if (!currentRoutineData || !currentRoutineData.length) return toastWarning('Load routine first');
  const data = [['Day', 'Time', 'Room', 'Course Code', 'Course Name', 'Teacher', 'Class']];
  currentRoutineData.forEach(r => {
    data.push([
      r.class_day, r.time_slot, r.room || '', r.course_code,
      r.course_name || '', r.teacher_name || '',
 yearLabel(r.year)
]);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 32 }, { wch: 26 }, { wch: 12 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Routine');
  XLSX.writeFile(wb, `ClassRoutine_${new Date().toISOString().slice(0,10)}.xlsx`);
  toastSuccess('📊 Excel downloaded');
}

async function exportRoutinePDF() {
  if (!currentRoutineData || !currentRoutineData.length) return toastWarning('Load routine first');
  const w = window.open('', '_blank');
  if (!w) return toastWarning('Allow pop-ups, then tap PDF again');
  const rows = currentRoutineData.map(r => `<tr><td>${escapeHtml(r.class_day)}</td><td>${escapeHtml(r.time_slot)}</td><td>${escapeHtml(r.room || '-')}</td><td>${escapeHtml(r.course_code)}</td><td>${escapeHtml(r.course_name || '-')}</td><td>${escapeHtml(r.teacher_name || '-')}</td><td>${escapeHtml(yearLabel(r.year))}</td></tr>`).join('');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Class Routine</title>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap" rel="stylesheet">
<style>@page{size:A4 landscape;margin:12mm}body{font-family:'Hind Siliguri','Segoe UI',Arial,sans-serif;color:#1f2937}
.h{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:14px 18px;border-radius:10px}.h b{font-size:20px}.h span{opacity:.85;font-size:13px;margin-left:10px}
.m{margin:10px 0;font-size:12px;color:#4b5563;display:flex;justify-content:space-between}table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#4f46e5;color:#fff;text-align:left;padding:7px}td{padding:6px 7px;border-bottom:1px solid #e5e7eb}tr:nth-child(even) td{background:#f5f3ff}</style></head>
<body><div class="h"><b>AMC Economics</b><span>Class Routine</span></div>
<div class="m"><span>Filter: ${escapeHtml(currentRoutineContext?.filterInfo || 'All classes')}</span><span>Generated: ${escapeHtml(new Date().toLocaleString('en-GB'))}</span></div>
<table><thead><tr><th>Day</th><th>Time</th><th>Room</th><th>Code</th><th>Course</th><th>Teacher</th><th>Class</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 700);
  toastInfo('Choose “Save as PDF” in the print dialog');
}
