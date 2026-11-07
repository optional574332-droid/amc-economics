/* js/reports.js — রিপোর্ট (Attendance, Exam, Individual, Exam-wise) */
// ============================================================
// REPORTS
// ============================================================
function showReportTab(tab) {
  document.querySelectorAll('[data-report-subtab]').forEach(b => b.classList.toggle('active', b.dataset.reportSubtab === tab));
  const el = document.getElementById('reportContent');
  const inp = 'border-2 rounded-xl p-2 dark:bg-gray-600 dark:text-white dark:border-gray-500';
  const yr = (id, onchange) => classPickerHtml(id, { placeholder: 'Class', cls: inp, onchange });
  const box = 'bg-gray-50 dark:bg-gray-700 p-4 rounded-xl';
  const btn = (fn, label, c) => `<button onclick="${fn}" class="bg-${c}-600 text-white px-4 py-2 rounded-xl btn-pop text-sm">${label}</button>`;
  if (tab === 'attendance') {
    el.innerHTML = `<div class="space-y-3"><div class="${box}"><div class="flex gap-2 flex-wrap mb-3"><select id="arSessionYear" class="${inp}"><option value="">Session year</option></select>${yr('arYear')}<button onclick="loadAttendanceReport()" class="bg-amber-600 text-white px-4 py-2 rounded-xl btn-pop">🔍</button></div><div class="flex gap-2 flex-wrap items-center mb-3"><label class="flex items-center gap-2 text-xs font-semibold dark:text-white"><input type="checkbox" id="arAll" checked onchange="arToggleDates()"> All dates</label><input type="date" id="arFrom" disabled class="${inp}"><input type="date" id="arTo" disabled class="${inp}"></div><div class="flex gap-2 flex-wrap items-center mb-3"><label class="flex items-center gap-2 text-xs font-semibold dark:text-white"><input type="checkbox" id="arLow" onchange="renderAttendanceReport()"> Show only students below ${PASS_PCT}%</label><button id="sortModeBtn" onclick="toggleSortMode()" class="text-sm px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-100 font-semibold">🔢 Roll</button></div><div class="flex gap-2">${btn('exportAttendanceExcel()', '📊 Excel', 'emerald')}${btn('exportAttendancePDF()', '📄 PDF', 'red')}</div></div><div id="attendanceReportArea"></div></div>`;
    rsBind('arSessionYear', 'arYear');
  } else if (tab === 'exam') {
    el.innerHTML = `<div class="space-y-3"><div class="${box}"><div class="flex gap-2 flex-wrap mb-3"><select id="erSessionYear" class="${inp}"><option value="">Session year</option></select>${yr('erYear')}<input id="erCourse" placeholder="Course code" class="${inp}"><button onclick="loadExamReport()" class="bg-amber-600 text-white px-4 py-2 rounded-xl btn-pop">🔍</button></div><div class="flex gap-2">${btn('exportExamExcel()', '📊 Excel', 'emerald')}${btn('exportExamPDF()', '📄 PDF', 'red')}</div></div><div id="examReportArea"></div></div>`;
    rsBind('erSessionYear', 'erYear');
  } else if (tab === 'individual') {
    el.innerHTML = `<div class="space-y-3"><div class="${box}"><div class="flex gap-2 flex-wrap mb-3"><select id="irSessionYear" class="${inp}"><option value="">Session year</option></select>${yr('irYear')}<input id="irRoll" placeholder="Class roll" class="${inp}"><input id="irReg" placeholder="Reg no" class="${inp}"><button onclick="loadIndividualReport()" class="bg-amber-600 text-white px-4 py-2 rounded-xl btn-pop">🔍</button></div><div class="flex gap-2">${btn('exportIndividualExcel()', '📊 Excel', 'emerald')}${btn('exportIndividualPDF()', '📄 PDF', 'red')}</div></div><div id="individualReportArea"></div></div>`;
    rsBind('irSessionYear', 'irYear');
  } else if (tab === 'examwise') {
    el.innerHTML = `<div class="space-y-3"><div class="${box}"><div class="flex gap-2 flex-wrap mb-3"><select id="erxSessionYear" class="${inp}" onchange="erxFillExams()"><option value="">Session year</option></select>${yr('erxYear')}<select id="erxExam" class="${inp}"><option value="">Exam</option></select><button onclick="loadExamwiseReport()" class="bg-amber-600 text-white px-4 py-2 rounded-xl btn-pop">🔍</button></div><div class="flex gap-2">${btn('exportExamwiseExcel()', '📊 Excel', 'emerald')}${btn('exportExamwisePDF()', '📄 PDF', 'red')}</div></div><div id="examwiseReportArea"></div></div>`;
    rsBind('erxSessionYear', 'erxYear', erxFillExams);
  }
}


// Session-year dropdown for reports: lists the active session years of the chosen class and refills when the class changes.
async function rsFill(syId, yearId) {
  const sy = document.getElementById(syId), y = document.getElementById(yearId);
  if (!sy || !y) return;
  const year = y.value, keep = sy.value;
  sy.innerHTML = '<option value="">Loading...</option>';
  const years = year ? await getAvailableSessionYears(year) : [];
  if (document.getElementById(syId) !== sy) return;
  sy.innerHTML = (years.length ? '<option value="">Select session year</option>' : '<option value="">No active students</option>') + years.map(v => `<option value="${v}">${v}</option>`).join('');
  if (years.map(String).includes(String(keep))) sy.value = keep; else if (years.length === 1) sy.value = years[0];
}
function rsBind(syId, yearId, after) {
  const y = document.getElementById(yearId); if (!y) return;
  y.addEventListener('change', async () => { await rsFill(syId, yearId); if (after) after(); });
  rsFill(syId, yearId).then(() => { if (after) after(); });
}

function arToggleDates() {
  const all = document.getElementById('arAll')?.checked;
  ['arFrom', 'arTo'].forEach(id => { const e = document.getElementById(id); if (e) { e.disabled = !!all; if (all) e.value = ''; } });
}
let currentAttendanceData = null;
async function loadAttendanceReport() {
  const year = document.getElementById('arYear').value;

  // session-year input
  const syInput = document.getElementById('arSessionYear');
  if (!syInput || !syInput.value) return toastWarning('Please select Session Year');
  const session_year = parseInt(syInput.value, 10);

  const area = document.getElementById('attendanceReportArea');
  currentAttendanceData = null;
  if (!year) { area.innerHTML = '<p class="text-red-500 text-center py-4">Select class</p>'; return; }

  area.innerHTML = '<p class="text-center py-4 dark:text-gray-300">⏳...</p>';
  try {
    // শুধু সেই সেশন গণনায় ধরা হয় যেখানে অন্তত একজনের হাজিরা রেকর্ড আছে (ফাঁকা PIN-সেশন বাদ)
    const { data: heldData, error: heldErr } = await db.rpc('get_held_sessions', { p_year: year, p_session_year: session_year });
    if (heldErr) throw heldErr;
    let sessions = heldData || [];
    const useAll = !document.getElementById('arAll') || document.getElementById('arAll').checked;
    const dFrom = document.getElementById('arFrom')?.value || '', dTo = document.getElementById('arTo')?.value || '';
    if (!useAll) {
      if (!dFrom || !dTo) { area.innerHTML = '<p class="text-red-500 text-center py-4">Pick both dates (or tick All dates)</p>'; return; }
      if (dFrom > dTo) { area.innerHTML = '<p class="text-red-500 text-center py-4">"From" date is after "To" date</p>'; return; }
      sessions = sessions.filter(s => s.date >= dFrom && s.date <= dTo);
    }
    const dateLabel = useAll ? 'All dates' : `${dFrom} to ${dTo}`;
    if (!sessions.length) { area.innerHTML = '<p class="text-center text-gray-400 py-4">No classes held for this session, class/year and period</p>'; return; }

    const records = await fetchByIds('attendance_records', 'student_id, session_id, status', 'session_id', sessions.map(s => s.id));
    const held = {}, codeOf = {};
    sessions.forEach(s => { held[s.course_code] = (held[s.course_code] || 0) + 1; codeOf[s.id] = s.course_code; });
    const courses = Object.keys(held).sort();
    await getCourseInfoMap();
    const by = {};
    records.forEach(r => {
      if (r.status !== 'present' && r.status !== 'late') return;
      const c = codeOf[r.session_id];
      (by[r.student_id] = by[r.student_id] || {})[c] = ((by[r.student_id] || {})[c] || 0) + 1;
    });

    // classStudents now takes session_year
    const students = await classStudents(year, 'id, class_roll, reg_no, name, is_irregular', session_year);
    const totalHeld = courses.reduce((t, c) => t + held[c], 0);
    const report = students.map(stu => {
      const cc = by[stu.id] || {};
      const total = courses.reduce((t, c) => t + (cc[c] || 0), 0);
      return { class_roll: stu.class_roll, reg_no: stu.reg_no || '', name: stu.name, irregular: !!stu.is_irregular, courseCounts: cc, total, pct: pctOf(total, totalHeld) };
    });
    currentAttendanceData = { year, session_year, dateLabel, courses, displayHeaders: courses.map(c => courseLabel(c)), held, totalHeld, report };
    renderAttendanceReport();
  } catch (err) { area.innerHTML = `<p class="text-red-500 text-center py-4">❌ ${escapeHtml(err.message)}</p>`; }
}
function attendanceRowsShown() {
  const d = currentAttendanceData; if (!d) return [];
  const filtered = document.getElementById('arLow')?.checked ? d.report.filter(r => r.pct < PASS_PCT) : d.report;
  return sortStudents(filtered);
}
function renderAttendanceReport() {
  const d = currentAttendanceData, area = document.getElementById('attendanceReportArea');
  if (!d || !area) return;
  const rows = attendanceRowsShown();
  const th = 'p-2 border dark:border-gray-600 dark:text-white', td = 'p-2 border dark:border-gray-600 text-center num-cell';
  area.innerHTML = `
    <p class="text-sm text-gray-600 dark:text-gray-300 mb-2"><b>Session Year:</b> ${escapeHtml(d.session_year)} | <b>Period:</b> ${escapeHtml(d.dateLabel || 'All dates')} | <b>Class:</b> ${escapeHtml(yearLabel(d.year))} | <b>Students:</b> <span class="num-display">${rows.length}</span> | <b>Classes held:</b> <span class="num-display">${d.totalHeld}</span> | <span class="text-red-600 font-bold">Red = below ${PASS_PCT}%</span></p>
    <div class="overflow-x-auto max-h-[500px] overflow-y-auto">
    <table class="min-w-full text-xs border dark:border-gray-600">
    <thead class="bg-gray-100 dark:bg-gray-700 sticky top-0">
      <tr><th class="${th}" rowspan="2">Roll</th><th class="${th}" rowspan="2">Reg No.</th><th class="${th} text-left" rowspan="2">Student Name</th><th class="${th} bg-indigo-100 dark:bg-indigo-900" colspan="${d.courses.length}">Course (classes attended)</th><th class="${th} bg-amber-100 dark:bg-amber-900" rowspan="2">Total</th><th class="${th} bg-amber-100 dark:bg-amber-900" rowspan="2">%</th></tr>
      <tr class="bg-indigo-50 dark:bg-indigo-900/50">${d.displayHeaders.map(h => `<th class="${th} num-display">${escapeHtml(h)}</th>`).join('')}</tr>
      <tr class="bg-gray-50 dark:bg-gray-600"><td colspan="3" class="${th} text-right font-bold">Classes held</td>${d.courses.map(c => `<td class="${td} font-bold">${d.held[c]}</td>`).join('')}<td class="${td} font-bold">${d.totalHeld}</td><td class="${td}">—</td></tr>
    </thead>
    <tbody>${rows.map(r => { const low = r.pct < PASS_PCT; return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-white"><td class="${td}">${escapeHtml(r.class_roll)}</td><td class="${td}">${escapeHtml(r.reg_no)}</td><td class="p-2 border dark:border-gray-600">${escapeHtml(r.name)}${r.irregular ? ' <span class="chip chip-none">Irregular</span>' : ''}</td>${d.courses.map(c => `<td class="${td}">${r.courseCounts[c] || 0}</td>`).join('')}<td class="${td} font-bold">${r.total}</td><td class="${td} font-bold ${low ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'}">${r.pct.toFixed(1)}%</td></tr>`; }).join('') || `<tr><td colspan="${d.courses.length + 5}" class="text-center py-4 text-gray-400">No students</td></tr>`}</tbody>
    </table></div>`;
  updateSortModeBtn();
}

async function exportAttendanceExcel() {
  if (!currentAttendanceData) return toastWarning('Load report first');
  const { session_year, year, dateLabel, courses, displayHeaders, held, totalHeld } = currentAttendanceData;
  const rows = attendanceRowsShown();
  const data = [
    ['AMC Economics — Attendance Report'], [`Session Year: ${session_year} | Class: ${yearLabel(year)} | Period: ${dateLabel || 'All dates'}`], [],
    ['', '', '', 'Course (classes attended)', ...Array(Math.max(courses.length - 1, 0)).fill(''), 'Total', '%', 'Remark'],
    ['Roll', 'Reg No.', 'Student Name', ...displayHeaders, 'Total', '%', 'Remark'],
    ['', '', 'Classes held', ...courses.map(c => held[c]), totalHeld, '', '']
  ];
  rows.forEach(r => data.push([r.class_roll, r.reg_no, r.name + (r.irregular ? ' (Irregular)' : ''), ...courses.map(c => r.courseCounts[c] || 0), r.total, Number(r.pct.toFixed(1)), r.pct < PASS_PCT ? `LOW (<${PASS_PCT}%)` : '']));
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 8 }, { wch: 15 }, { wch: 28 }, ...courses.map(() => ({ wch: 12 })), { wch: 8 }, { wch: 8 }, { wch: 12 }];
  ws['!merges'] = [{ s: { r: 3, c: 3 }, e: { r: 3, c: 3 + Math.max(courses.length - 1, 0) } }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  XLSX.writeFile(wb, `Attendance_${session_year}_${year.replace(/\W+/g, '_')}.xlsx`);
}

async function exportAttendancePDF() {
  if (!currentAttendanceData) return toastWarning('Load report first');
  const { session_year, year, dateLabel, courses, displayHeaders, held, totalHeld } = currentAttendanceData;
  const rows = attendanceRowsShown();
  const last = courses.length + 4;
  const body = [['', '', 'Classes held', ...courses.map(c => held[c]), totalHeld, ''],
    ...rows.map(r => [r.class_roll, r.reg_no, r.name + (r.irregular ? ' (I)' : ''), ...courses.map(c => r.courseCounts[c] || 0), r.total, r.pct.toFixed(1) + '%'])];
  await savePdfA4({
    file: `Attendance_${session_year}_${year.replace(/\W+/g, '_')}.pdf`, title: 'Attendance Report',
    lines: [`Session Year: ${session_year}   |   Class: ${yearLabel(year)}   |   Period: ${dateLabel || 'All dates'}`, `Students: ${rows.length}   |   Classes held: ${totalHeld}   |   Red = below ${PASS_PCT}%`],
    head: [[{ content: 'Roll', rowSpan: 2 }, { content: 'Reg No.', rowSpan: 2 }, { content: 'Student Name', rowSpan: 2 }, { content: 'Course (classes attended)', colSpan: courses.length }, { content: 'Total', rowSpan: 2 }, { content: '%', rowSpan: 2 }], displayHeaders],
    body, orientation: (courses.length + 5) > 7 ? 'landscape' : 'portrait',
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      if (data.row.index === 0) { data.cell.styles.fillColor = [229, 231, 235]; data.cell.styles.fontStyle = 'bold'; return; }
      if (data.column.index === last) {
        const v = parseFloat(data.cell.raw);
        if (!isNaN(v) && v < PASS_PCT) { data.cell.styles.fillColor = [254, 202, 202]; data.cell.styles.textColor = [153, 27, 27]; }
      }
    }
  });
}

// ---- Class (year) model: Category -> Year, stored codes stay the same ----
const YEAR_GROUPS = {
  'Higher Secondary': [['XI', 'XI'], ['XII', 'XII']],
  'Honours': [['1st Year', '1st'], ['2nd Year', '2nd'], ['3rd Year', '3rd'], ['4th Year', '4th']],
  'Masters': [['Preliminary', 'Preliminary to Masters'], ['Final', 'Masters Final']]
};
const ALL_YEAR_CODES = [].concat(...Object.values(YEAR_GROUPS).map(g => g.map(x => x[1])));
function yearCodeOf(cat, yearName) { const f = (YEAR_GROUPS[cat] || []).find(x => x[0] === yearName); return f ? f[1] : ''; }
function yearLabel(code) {
  for (const [cat, g] of Object.entries(YEAR_GROUPS)) { const f = g.find(x => x[1] === code); if (f) return cat + ' · ' + f[0]; }
  return code || '';
}
// Which session_year (YYYY) values have active students in a given class/year
async function getAvailableSessionYears(year) {
  try {
    const { data, error } = await db.rpc('get_available_session_years', { p_year: year });
    if (error) throw error;
    // unique years, newest first (e.g. 2027, 2026)
    const years = [...new Set((data || []).map(s => s.session_year))].filter(Boolean).sort((a, b) => b - a);
    return years;
  } catch (e) {
    console.error('Error fetching session years:', e);
    return [];
  }
}
function yearOptionsHtml(sel) { return ALL_YEAR_CODES.map(y => `<option value="${attrEsc(y)}"${y === sel ? ' selected' : ''}>${escapeHtml(yearLabel(y))}</option>`).join(''); }
// Class picker: Category (Higher Secondary / Honours / Masters) -> year names. The year <select> keeps the id you pass,
// so existing code that reads document.getElementById(id).value keeps working.
const CP_CLS = 'w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600';
function cpYearOpts(cat, sel, ph) {
  const list = cat ? (YEAR_GROUPS[cat] || []) : [].concat(...Object.values(YEAR_GROUPS));
  return (ph ? `<option value="">${escapeHtml(ph)}</option>` : '') + list.map(x => `<option value="${attrEsc(x[1])}"${x[1] === sel ? ' selected' : ''}>${escapeHtml(x[0])}</option>`).join('');
}
function classPickerHtml(id, o = {}) {
  const cls = o.cls || CP_CLS, ph = o.placeholder || '';
  const cats = Object.keys(YEAR_GROUPS);
  let selCat = o.allCats ? '' : cats[0];
  if (o.sel) selCat = cats.find(c => YEAR_GROUPS[c].some(x => x[1] === o.sel)) || selCat;
  const catOpts = (o.allCats ? '<option value="">All categories</option>' : '') + cats.map(c => `<option value="${attrEsc(c)}"${c === selCat ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
  return `<select id="${id}Cat" onchange="cpCatChange('${id}', '${attrEsc(ph)}')" class="${cls}">${catOpts}</select><select id="${id}"${o.onchange ? ` onchange="${o.onchange}"` : ''} class="${cls}">${cpYearOpts(selCat, o.sel, ph)}</select>`;
}
function cpCatChange(id, ph) {
  const cat = document.getElementById(id + 'Cat').value, y = document.getElementById(id);
  y.innerHTML = cpYearOpts(cat, '', ph);
  y.dispatchEvent(new Event('change'));
}

// Teacher picker: session year + category + year + course (course list follows the chosen class).
// Course <select> value stays "code|year" so downstream code is unchanged.
let _tp = {};
function teacherPickerHtml(p, courseId, syId, o = {}) {
  const cats = Object.keys(YEAR_GROUPS);
  return `<select id="${syId}" class="${CP_CLS}"><option value="">Session year</option></select>
<select id="${p}Cat" onchange="tpCatChange('${p}')" class="${CP_CLS}">${cats.map(c => `<option value="${attrEsc(c)}">${escapeHtml(c)}</option>`).join('')}</select>
<select id="${p}Year" onchange="tpYearChange('${p}')" class="${CP_CLS}"></select>
<select id="${courseId}" class="${CP_CLS}"></select>`;
}
function tpInit(p, courseId, syId, courses, o = {}) {
  const first = courses[0];
  _tp[p] = { courseId, syId, courses, all: !!o.all };
  const cat = first ? (Object.keys(YEAR_GROUPS).find(c => YEAR_GROUPS[c].some(x => x[1] === first.year)) || Object.keys(YEAR_GROUPS)[0]) : Object.keys(YEAR_GROUPS)[0];
  document.getElementById(p + 'Cat').value = cat;
  document.getElementById(p + 'Year').innerHTML = cpYearOpts(cat, first ? first.year : '', '');
  tpYearChange(p);
}
function tpCatChange(p) {
  const cat = document.getElementById(p + 'Cat').value;
  document.getElementById(p + 'Year').innerHTML = cpYearOpts(cat, '', '');
  tpYearChange(p);
}
async function tpYearChange(p) {
  const st = _tp[p]; if (!st) return;
  const year = document.getElementById(p + 'Year').value;
  const list = st.courses.filter(c => c.year === year);
  document.getElementById(st.courseId).innerHTML = (st.all ? '<option value="">All courses</option>' : '') +
    (list.map(c => `<option value="${attrEsc(c.course_code)}|${attrEsc(c.year)}">${escapeHtml(courseLabel(c.course_code))}</option>`).join('') || (st.all ? '' : '<option value="">No courses in this class</option>'));
  const sy = document.getElementById(st.syId);
  sy.innerHTML = '<option value="">Loading...</option>';
  const years = await getAvailableSessionYears(year);
  sy.innerHTML = (st.all ? '<option value="">All session years</option>' : (years.length ? '<option value="">Select session year</option>' : '<option value="">No active students</option>')) +
    years.map(y => `<option value="${y}">${y}</option>`).join('');
  if (!st.all && years.length === 1) sy.value = years[0];
}
function nextYearOf(code) {
  for (const g of Object.values(YEAR_GROUPS)) { const i = g.findIndex(x => x[1] === code); if (i >= 0) return i + 1 < g.length ? g[i + 1][1] : null; }
  return null;
}
function sessionError(s) {
  if (!/^\d{4}-\d{2}$/.test(s)) return 'Session format must be like 2025-26';
  const a = parseInt(s.slice(0, 4), 10), b = parseInt(s.slice(5), 10);
  if ((a + 1) % 100 !== b) return `Session looks wrong. Did you mean ${a}-${String((a + 1) % 100).padStart(2, '0')}?`;
  return '';
}
const PASS_PCT = 60;
function pctOf(a, b) { return b > 0 ? (a / b) * 100 : 0; }

// ---- Fetch utilities (avoid the 1000-row limit and long URLs) ----
async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function fetchByIds(table, cols, col, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80);
    out.push(...await fetchAll((a, b) => db.from(table).select(cols).in(col, part).range(a, b)));
  }
  return out;
}
// Students of a class + session_year (any status) plus extra ids (e.g. students who have marks but are no longer active)
async function cohortStudents(year, session_year, extraIds, cols) {
  cols = cols || 'id, class_roll, reg_no, name, status, is_irregular, session, year';
  const base = await fetchAll((a, b) => db.from('students').select(cols).eq('year', year).eq('session_year', session_year).range(a, b));
  const have = new Set(base.map(s => s.id));
  const missing = [...new Set(extraIds || [])].filter(id => !have.has(id));
  const extra = missing.length ? await fetchByIds('students', cols, 'id', missing) : [];
  return sortStudents(base.concat(extra));
}
// Active students of a class in one session_year (irregular students are included: same class + session_year)
async function classStudents(year, cols, session_year) {
  const { data, error } = await db.from('students').select(cols || 'id, name, class_roll, reg_no, session, is_irregular, session_year')
    .eq('year', year).eq('session_year', session_year).eq('status', 'active').limit(2000);
  if (error) throw error;
  return sortStudents(data || []);
}
// .or() filter for roll / reg (/ name when partial). Callers add .eq('year') and .eq('session_year') themselves.
function rollFilter(q, partial) {
  q = String(q).replace(/[,()*%]/g, '');
  return partial ? `class_roll.ilike.%${q}%,reg_no.ilike.%${q}%,name.ilike.%${q}%` : `class_roll.eq.${q},reg_no.eq.${q}`;
}
let pickedStudent = null;
// session_year for a class: the only one that has active students, or ask when there are several
async function pickSessionYear(year) {
  const years = await getAvailableSessionYears(year);
  if (!years.length) throw new Error('No active students found for ' + yearLabel(year));
  if (years.length === 1) return years[0];
  const r = await Swal.fire({ title: 'Select session year', input: 'select', inputOptions: Object.fromEntries(years.map(y => [y, y])), inputValue: years[0], showCancelButton: true, confirmButtonText: 'OK', confirmButtonColor: '#4f46e5' });
  if (!r.isConfirmed) throw new Error('Cancelled');
  return parseInt(r.value, 10);
}

// ---- A4 PDF helper (printable, page numbers, repeating headers) ----
async function savePdfA4({ file, title, lines = [], head, body, orientation, headFill = [79, 70, 229], didParseCell, repeatCols = [0, 1, 2] }) {
  const { jsPDF } = window.jspdf;
  const ncols = ((body && body[0]) || (head && head[head.length - 1]) || []).length;
  const orient = orientation || (ncols > 7 ? 'landscape' : 'portrait');
  const doc = new jsPDF({ orientation: orient, unit: 'mm', format: 'a4' });
  const bn = await setupBanglaFont(doc);
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 12;
  doc.setFontSize(13); doc.text('AMC Economics — Department of Economics', M, 12);
  doc.setFontSize(11); doc.text(String(title), M, 18);
  doc.setFontSize(9); let y = 23;
  lines.forEach(l => { doc.text(String(l), M, y); y += 4.5; });
  const fs = ncols > 18 ? 5.5 : ncols > 13 ? 6.5 : ncols > 9 ? 7.5 : 8.5;
  const styles = { fontSize: fs, cellPadding: 1.3, overflow: 'linebreak' };
  const headStyles = { fillColor: headFill, textColor: 255, halign: 'center', fontStyle: 'normal' };
  if (bn) { styles.font = 'HindSiliguri'; headStyles.font = 'HindSiliguri'; }
  doc.autoTable({ head, body, startY: y + 1, margin: { left: M, right: M, top: 14, bottom: 14 }, styles, headStyles, alternateRowStyles: { fillColor: [245, 247, 255] }, showHead: 'everyPage', horizontalPageBreak: ncols > 20, horizontalPageBreakRepeat: repeatCols, didParseCell });
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Page ${i} of ${n}`, W / 2, H - 6, { align: 'center' });
    doc.text('Generated: ' + new Date().toLocaleString('en-GB'), W - M, H - 6, { align: 'right' });
  }
  doc.save(file);
}

// ---- helpers: token-based session access (PIN column stays private) ----
async function mySess(o = {}) {
  const { data, error } = await db.rpc('t_my_sessions', { p_token: currentTeacher.token, p_active_only: !!o.active, p_from: o.from || null, p_to: o.to || null, p_session_year: o.session_year ? parseInt(o.session_year, 10) : null, p_year: o.year || null, p_course_code: o.course || null, p_date: o.date || null });
  return { data: data || [], error };
}
async function mySessOne(o) { const r = await mySess(o); return { data: r.data[0] || null, error: r.error }; }
async function sessByPin(pin, sig) {
  let q = db.rpc('get_session_by_pin', { p_pin: pin });
  if (sig) q = q.abortSignal(sig);
  const { data, error } = await q;
  return { data: data ? [{ ...data, is_active: true }] : [], error };
}

// ---- Exam-wise result report (all courses of one exam) ----
const STD_EXAMS = ['1st In-course', '2nd In-course', 'Assignment', 'Quiz Test', 'Class Test', 'Departmental Exam', 'Annual Exam'];
let currentExamwiseData = null;
async function erxFillExams() {
  const sel = document.getElementById('erxExam'); if (!sel) return;
  const s = parseInt(document.getElementById('erxSessionYear').value, 10), y = document.getElementById('erxYear').value, keep = sel.value;
  const list = (await getExamTypes(true)).map(e => e.name);
  if (s && y) {
    try {
      const data = await fetchAll((a, b) => db.from('marks').select('exam_type').eq('session_year', s).eq('year', y).range(a, b));
      data.forEach(m => { if (m.exam_type && !list.includes(m.exam_type)) list.push(m.exam_type); });
    } catch (e) { console.warn(e); }
  }
  sel.innerHTML = '<option value="">Exam</option>' + list.map(e => `<option>${escapeHtml(e)}</option>`).join('');
  if (list.includes(keep)) sel.value = keep;
}
async function loadExamwiseReport() {
  const session_year = parseInt(document.getElementById('erxSessionYear').value, 10), year = document.getElementById('erxYear').value, exam = document.getElementById('erxExam').value;
  const area = document.getElementById('examwiseReportArea');
  currentExamwiseData = null;
  if (!session_year || !year || !exam) { area.innerHTML = '<p class="text-red-500 text-center py-4">Select session year, class and exam</p>'; return; }
  area.innerHTML = '<p class="text-center py-4 dark:text-gray-300">⏳...</p>';
  try {
    const marks = await fetchAll((a, b) => db.from('marks').select('student_id, course_code, marks').eq('session_year', session_year).eq('year', year).eq('exam_type', exam).range(a, b));
    const courses = [...new Set(marks.map(m => m.course_code))].sort();
    if (!courses.length) { area.innerHTML = '<p class="text-gray-400 text-center py-4">No marks found for this exam</p>'; return; }
    const mMap = {};
    marks.forEach(m => { (mMap[m.student_id] = mMap[m.student_id] || {})[m.course_code] = m.marks; });
    await getCourseInfoMap();
    const students = (await cohortStudents(year, session_year, marks.map(m => m.student_id))).filter(s => s.status === 'active' || mMap[s.id]);
    currentExamwiseData = { session_year, year, exam, courses, students, mMap };
    const th = 'p-2 border dark:border-gray-600 dark:text-white', td = 'p-2 border dark:border-gray-600 text-center num-cell';
    area.innerHTML = `<p class="text-sm mb-2 dark:text-white"><b>Exam:</b> ${escapeHtml(exam)} | <b>Session Year:</b> ${escapeHtml(session_year)} | <b>Class:</b> ${escapeHtml(yearLabel(year))} | <b>Courses:</b> ${courses.length}</p>
      <div class="overflow-x-auto max-h-[500px] overflow-y-auto"><table class="min-w-full text-xs border dark:border-gray-600"><thead class="bg-gray-100 dark:bg-gray-700 sticky top-0"><tr><th class="${th}">Roll</th><th class="${th}">Reg</th><th class="${th} text-left">Name</th>${courses.map(c => `<th class="${th} num-display">${escapeHtml(courseLabel(c))}</th>`).join('')}<th class="${th}">Total</th></tr></thead><tbody>
      ${students.map(s => { const row = mMap[s.id] || {}; const total = courses.reduce((t, c) => t + (Number(row[c]) || 0), 0);
        return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-white"><td class="${td}">${escapeHtml(s.class_roll)}</td><td class="${td}">${escapeHtml(s.reg_no || '')}</td><td class="p-2 border dark:border-gray-600">${escapeHtml(s.name)}${s.is_irregular ? ' <span class="chip chip-none">Irregular</span>' : ''}</td>${courses.map(c => `<td class="${td}">${row[c] ?? '-'}</td>`).join('')}<td class="${td} font-bold">${total}</td></tr>`; }).join('') || '<tr><td colspan="20" class="text-center py-4 text-gray-400">No students</td></tr>'}
      </tbody></table></div>`;
  } catch (err) { area.innerHTML = `<p class="text-red-500 text-center py-4">❌ ${escapeHtml(err.message)}</p>`; }
}
function examwiseRows() {
  const { courses, students, mMap } = currentExamwiseData;
  return students.map(s => { const row = mMap[s.id] || {}; const total = courses.reduce((t, c) => t + (Number(row[c]) || 0), 0); return [s.class_roll, s.reg_no || '', s.name + (s.is_irregular ? ' (Irregular)' : ''), ...courses.map(c => row[c] ?? '-'), total]; });
}
function exportExamwiseExcel() {
  if (!currentExamwiseData) return toastWarning('Load report first');
  const { session_year, year, exam, courses } = currentExamwiseData;
  const data = [[`Exam Result — ${exam}`], [`Session Year: ${session_year} | Class: ${yearLabel(year)}`], [], ['Roll', 'Reg No.', 'Name', ...courses.map(c => courseLabel(c)), 'Total'], ...examwiseRows()];
  const ws = XLSX.utils.aoa_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Result');
  XLSX.writeFile(wb, `ExamResult_${exam.replace(/[^\w.-]+/g, '_')}_${session_year}_${year.replace(/\W+/g, '_')}.xlsx`);
}
async function exportExamwisePDF() {
  if (!currentExamwiseData) return toastWarning('Load report first');
  const { session_year, year, exam, courses } = currentExamwiseData;
  await savePdfA4({
    file: `ExamResult_${exam.replace(/[^\w.-]+/g, '_')}_${session_year}_${year.replace(/\W+/g, '_')}.pdf`, title: `Exam Result — ${exam}`, headFill: [13, 148, 136],
    lines: [`Session Year: ${session_year}   |   Class: ${yearLabel(year)}`],
    head: [['Roll', 'Reg No.', 'Name', ...courses.map(c => courseLabel(c)), 'Total']], body: examwiseRows()
  });
}

let currentExamData = null;
async function loadExamReport() {
  const session_year = parseInt(document.getElementById('erSessionYear').value, 10);
  const year = document.getElementById('erYear').value;
  const course = document.getElementById('erCourse').value.trim();
  const area = document.getElementById('examReportArea');
  currentExamData = null;
  if (!session_year || !year || !course) { area.innerHTML = '<p class="text-red-500 text-center py-4">Fill all fields</p>'; return; }
  area.innerHTML = '<p class="text-center py-4 dark:text-gray-300">⏳...</p>';
  try {
    const marks = await fetchAll((a, b) => db.from('marks').select('student_id, exam_type, marks').eq('session_year', session_year).eq('year', year).eq('course_code', course).range(a, b));
    const mMap = {};
    marks.forEach(m => { (mMap[m.student_id] = mMap[m.student_id] || {})[m.exam_type] = m.marks; });
    const students = (await cohortStudents(year, session_year, marks.map(m => m.student_id))).filter(s => s.status === 'active' || mMap[s.id]);
    const etAll = await getExamTypes(true);
  const flagged = etAll.filter(e => e.counts_in_total).map(e => e.name);
  const baseTypes = flagged.length ? flagged : STD_EXAMS.slice(0, 5);
    const extra = [...new Set(marks.map(m => m.exam_type))].filter(t => !baseTypes.includes(t)).sort();
    const examTypes = baseTypes.concat(extra);
    currentExamData = { session_year, year, course, examTypes, baseTypes, students, markMap: mMap };
    const th = 'p-2 border dark:border-gray-600 dark:text-white', td = 'p-2 border dark:border-gray-600 text-center num-cell';
    area.innerHTML = `
      <p class="text-sm mb-2 dark:text-white"><b>Session Year:</b> ${escapeHtml(session_year)} | <b>Class:</b> ${escapeHtml(yearLabel(year))} | <b>Course:</b> <span class="num-display">${escapeHtml(courseLabel(course))}</span></p>
      <div class="overflow-x-auto max-h-[500px] overflow-y-auto"><table class="min-w-full text-xs border dark:border-gray-600">
      <thead class="bg-gray-100 dark:bg-gray-700 sticky top-0"><tr><th class="${th}">Roll</th><th class="${th}">Reg</th><th class="${th} text-left">Name</th>${examTypes.map(e => `<th class="${th}">${escapeHtml(e)}</th>`).join('')}<th class="${th} bg-amber-100 dark:bg-amber-900">Total${extra.length ? ' (first 5)' : ''}</th></tr></thead>
      <tbody>${students.map(s => { const row = mMap[s.id] || {}; const total = baseTypes.reduce((t, e) => t + (row[e] || 0), 0);
        return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-white"><td class="${td}">${escapeHtml(s.class_roll)}</td><td class="${td}">${escapeHtml(s.reg_no || '-')}</td><td class="p-2 border dark:border-gray-600">${escapeHtml(s.name)}${s.is_irregular ? ' <span class="chip chip-none">Irregular</span>' : ''}</td>${examTypes.map(e => `<td class="${td}">${row[e] ?? '-'}</td>`).join('')}<td class="${td} font-bold bg-amber-50 dark:bg-amber-900/30">${total}</td></tr>`; }).join('') || '<tr><td colspan="12" class="text-center py-4 text-gray-400">No students</td></tr>'}</tbody></table></div>`;
  } catch (err) { area.innerHTML = `<p class="text-red-500 text-center py-4">❌ ${escapeHtml(err.message)}</p>`; }
}

async function exportExamExcel() {
  if (!currentExamData) return toastWarning('Load report first');
  const { session_year, year, course, examTypes, baseTypes, students, markMap } = currentExamData;
  const data = [['AMC Economics — Marks Report'], [`Session Year: ${session_year} | Class: ${yearLabel(year)} | Course: ${courseLabel(course)}`], [], ['Roll', 'Reg No.', 'Name', ...examTypes, 'Total']];
  students.forEach(s => { const row = markMap[s.id] || {}; data.push([s.class_roll, s.reg_no || '', s.name + (s.is_irregular ? ' (Irregular)' : ''), ...examTypes.map(e => row[e] ?? ''), baseTypes.reduce((t, e) => t + (row[e] || 0), 0)]); });
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Marks');
  XLSX.writeFile(wb, `Exam_${course}_${session_year}.xlsx`);
}

async function exportExamPDF() {
  if (!currentExamData) return toastWarning('Load report first');
  const { session_year, year, course, examTypes, baseTypes, students, markMap } = currentExamData;
  await savePdfA4({
    file: `Exam_${course}_${session_year}.pdf`, title: 'Exam Mark Report', headFill: [245, 158, 11],
    lines: [`Course: ${courseLabel(course)}`, `Session Year: ${session_year}   |   Class: ${yearLabel(year)}`],
    head: [['Roll', 'Reg No.', 'Name', ...examTypes, 'Total']],
    body: students.map(s => { const row = markMap[s.id] || {}; return [s.class_roll, s.reg_no || '-', s.name + (s.is_irregular ? ' (I)' : ''), ...examTypes.map(e => row[e] ?? '-'), baseTypes.reduce((t, e) => t + (row[e] || 0), 0)]; })
  });
}

let currentIndividualData = null;
async function loadIndividualReport() {
  const year = document.getElementById('irYear').value;
  const session_year = parseInt(document.getElementById('irSessionYear').value, 10);
  const roll = document.getElementById('irRoll').value.trim().replace(/[,()*%]/g, '');
  const reg = document.getElementById('irReg').value.trim().replace(/[,()*%]/g, '');
  const area = document.getElementById('individualReportArea');
  currentIndividualData = null;
  if (!year || !session_year || (!roll && !reg)) { area.innerHTML = '<p class="text-red-500 text-center py-4">Enter session year, class and roll or reg no</p>'; return; }
  area.innerHTML = '<p class="text-center py-4 dark:text-gray-300">⏳...</p>';
  try {
    const cols = 'id, name, class_roll, reg_no, session, session_year, year, is_irregular';
    // only active students of this class + session_year; roll is used when given, otherwise reg
    let sq = db.from('students').select(cols).eq('year', year).eq('session_year', session_year).eq('status', 'active');
    sq = roll ? sq.eq('class_roll', roll) : sq.eq('reg_no', reg);
    const { data: found } = await sq.limit(2);
    if (!found || !found.length) { area.innerHTML = '<p class="text-red-500 text-center py-4">❌ Student not found</p>'; return; }
    const student = found[0];
    // if the student has a reg no, it must be given and must match
    if (student.reg_no && String(student.reg_no).trim() !== '' && String(student.reg_no).toLowerCase() !== reg.toLowerCase()) {
      area.innerHTML = `<p class="text-red-500 text-center py-4">❌ ${reg ? 'Registration number does not match' : 'This student has a registration number. Enter it.'}</p>`; return;
    }
    // শুধু যেসব সেশনে অন্তত একজনের হাজিরা আছে সেগুলোই "ক্লাস হয়েছে" ধরা হয়
    const { data: heldData, error: heldErr } = await db.rpc('get_held_sessions', { p_year: year, p_session_year: session_year });
    if (heldErr) throw heldErr;
    const sessions = heldData || [];
    const recs = await fetchAll((a, b) => db.from('attendance_records').select('session_id, status').eq('student_id', student.id).range(a, b));
    const recMap = {}; recs.forEach(r => { recMap[r.session_id] = r.status; });
    const dMap = {}, held = {}, att = {};
    sessions.forEach(s => {
      const st = recMap[s.id] || null;
      (dMap[s.date] = dMap[s.date] || {})[s.course_code] = st;
      held[s.course_code] = (held[s.course_code] || 0) + 1;
      if (st === 'present' || st === 'late') att[s.course_code] = (att[s.course_code] || 0) + 1;
    });
    const dates = Object.keys(dMap).sort(), cCodes = Object.keys(held).sort();
    const totalHeld = cCodes.reduce((t, c) => t + held[c], 0), totalAtt = cCodes.reduce((t, c) => t + (att[c] || 0), 0), pct = pctOf(totalAtt, totalHeld);
    currentIndividualData = { student, session_year, year, courseCodes: cCodes, dates, dateMap: dMap, held, att, totalHeld, totalAtt, pct };
    await getCourseInfoMap();
    const th = 'p-2 border dark:border-gray-600 dark:text-white', low = pct < PASS_PCT;
    area.innerHTML = `
      <div class="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-xl mb-3">
        <p class="text-sm dark:text-white"><b>Name:</b> ${escapeHtml(student.name)}${student.is_irregular ? ' <span class="chip chip-none">Irregular</span>' : ''}</p>
        <p class="text-sm dark:text-white"><b>Roll:</b> <span class="num-display">${escapeHtml(student.class_roll)}</span> | <b>Reg:</b> <span class="num-display">${escapeHtml(student.reg_no || '-')}</span> | <b>Class:</b> ${escapeHtml(yearLabel(year))}</p>
        <p class="text-sm mt-1 font-bold ${low ? 'text-red-600' : 'text-emerald-600'}">Attendance: <span class="num-display">${totalAtt}/${totalHeld}</span> (${pct.toFixed(1)}%)${low ? ` — below ${PASS_PCT}%` : ''}</p>
      </div>
      <div class="overflow-x-auto max-h-[500px] overflow-y-auto"><table class="min-w-full text-xs border dark:border-gray-600">
      <thead class="bg-gray-100 dark:bg-gray-700 sticky top-0"><tr><th class="${th}">Date</th>${cCodes.map(c => `<th class="${th} num-display">${escapeHtml(c)}</th>`).join('')}</tr>
        <tr class="bg-gray-50 dark:bg-gray-600"><td class="${th} text-center font-bold">Attended</td>${cCodes.map(c => `<td class="${th} text-center font-bold num-cell">${att[c] || 0}/${held[c]}</td>`).join('')}</tr></thead>
      <tbody>${dates.map(d => `<tr class="hover:bg-gray-50 dark:hover:bg-gray-700"><td class="p-2 border dark:border-gray-600 text-center font-bold dark:text-white num-cell">${escapeHtml(d)}</td>${cCodes.map(c => { const st = dMap[d][c]; let disp = '-', cls = 'text-gray-400'; if (st === 'present') { disp = 'P'; cls = 'text-emerald-600 font-bold'; } else if (st === 'absent') { disp = 'A'; cls = 'text-red-600 font-bold'; } else if (st === 'late') { disp = 'L'; cls = 'text-amber-600 font-bold'; } else if (st === 'excused') { disp = 'E'; cls = 'text-blue-600 font-bold'; } else if (c in dMap[d]) { disp = 'A'; cls = 'text-red-400'; } return `<td class="p-2 border dark:border-gray-600 text-center ${cls} num-cell">${disp}</td>`; }).join('')}</tr>`).join('') || '<tr><td colspan="10" class="text-center py-4 text-gray-400">No classes found</td></tr>'}</tbody></table></div>`;
  } catch (err) { area.innerHTML = `<p class="text-red-500 text-center py-4">❌ ${escapeHtml(err.message)}</p>`; }
}
function indivCell(d, date, c) {
  const st = d.dateMap[date][c];
  if (st === 'present') return 'P'; if (st === 'late') return 'L'; if (st === 'excused') return 'E'; if (st === 'absent') return 'A';
  return (c in d.dateMap[date]) ? 'A' : '';
}

async function exportIndividualExcel() {
  const d = currentIndividualData;
  if (!d) return toastWarning('Load report first');
  const { student, session_year, year, courseCodes, dates } = d;
  const data = [['AMC Economics — Individual Attendance Report'], [''], ['Roll', student.class_roll], ['Reg', student.reg_no || ''], ['Name', student.name], ['Session', student.session || ''], ['Session Year', session_year], ['Class', yearLabel(year)], [''], ['Date', ...courseCodes]];
  dates.forEach(dt => data.push([dt, ...courseCodes.map(c => indivCell(d, dt, c))]));
  data.push([''], ['Attended', ...courseCodes.map(c => d.att[c] || 0)], ['Held', ...courseCodes.map(c => d.held[c])], ['Total', `${d.totalAtt}/${d.totalHeld}`, `${d.pct.toFixed(1)}%`]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Individual');
  XLSX.writeFile(wb, `Individual_${student.class_roll}.xlsx`);
}

async function exportIndividualPDF() {
  const d = currentIndividualData;
  if (!d) return toastWarning('Load report first');
  const { student, session_year, year, courseCodes, dates } = d;
  await savePdfA4({
    file: `Individual_${student.class_roll}.pdf`, title: 'Individual Attendance Report', headFill: [236, 72, 153], repeatCols: [0],
    lines: [`Name: ${student.name}   |   Roll: ${student.class_roll}   |   Reg: ${student.reg_no || '-'}`, `Session: ${student.session || '-'}   |   Session Year: ${session_year}   |   Class: ${yearLabel(year)}`, `Attendance: ${d.totalAtt}/${d.totalHeld} (${d.pct.toFixed(1)}%)${d.pct < PASS_PCT ? ' — below ' + PASS_PCT + '%' : ''}`],
    head: [['Date', ...courseCodes]],
    body: [['Attended / Held', ...courseCodes.map(c => `${d.att[c] || 0}/${d.held[c]}`)], ...dates.map(dt => [dt, ...courseCodes.map(c => indivCell(d, dt, c) || '-')])],
    didParseCell: (x) => { if (x.section === 'body' && x.row.index === 0) { x.cell.styles.fillColor = [229, 231, 235]; x.cell.styles.fontStyle = 'bold'; } }
  });
}
