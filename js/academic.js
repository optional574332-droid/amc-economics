/* js/academic.js — Academic Setup, Exam Types, Mapping */
// ============================================================
// ACADEMIC HELPERS
// ============================================================
function dedupeCourses(list) {
  const seen = new Set();
  return (list || []).filter(c => { const k = `${c.course_code}|${c.year}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

let mapCoursesCache = [];
async function loadAcademicCoursesForMap() {
  const { data } = await db.from('courses_new').select('*').order('course_code');
  mapCoursesCache = data || [];
  mapLoadCourses();
}
function mapFillYears() {
  const cat = document.getElementById('mapCategory').value;
  const ySel = document.getElementById('mapYearName');
  ySel.innerHTML = '<option value="">Select year</option>' + (YEAR_GROUPS[cat] || []).map(y => `<option value="${attrEsc(y[0])}">${escapeHtml(y[0])}</option>`).join('');
  mapLoadCourses();
}
function mapLoadCourses() {
  const sel = document.getElementById('mapCourseSelect');
  if (!sel) return;
  const cat = document.getElementById('mapCategory')?.value, yn = document.getElementById('mapYearName')?.value;
  const list = (cat && yn) ? mapCoursesCache.filter(c => c.category === cat && c.year_name === yn) : [];
  sel.innerHTML = '<option value="">' + ((cat && yn) ? (list.length ? 'Select course' : 'No course added for this class (use Academic tab)') : 'Select category and year first') + '</option>' +
    list.map(c => `<option value="${attrEsc(c.course_code)}|${attrEsc(c.course_name)}">${escapeHtml(c.course_code)} - ${escapeHtml(c.short_code || c.course_name)}</option>`).join('') +
    '<option value="NON_MAJOR">✍️ Other / Non-Major (Manual Entry)</option>';
  fillCourseDetails();
}

function fillCourseDetails() {
  const sel = document.getElementById('mapCourseSelect');
  const codeInput = document.getElementById('mapCourse');
  const nameInput = document.getElementById('mapCourseName');

  if (!sel || !sel.value) {
    codeInput.value = ''; nameInput.value = '';
    codeInput.readOnly = true; nameInput.readOnly = true;
    codeInput.classList.add('bg-gray-100', 'dark:bg-gray-600'); nameInput.classList.add('bg-gray-100', 'dark:bg-gray-600');
    codeInput.placeholder = "Course code"; nameInput.placeholder = "Course name";
    return;
  }

  if (sel.value === 'NON_MAJOR') {
    codeInput.value = ''; nameInput.value = '';
    codeInput.readOnly = false; nameInput.readOnly = false;
    codeInput.classList.remove('bg-gray-100', 'dark:bg-gray-600'); nameInput.classList.remove('bg-gray-100', 'dark:bg-gray-600');
    codeInput.placeholder = "Type course code"; nameInput.placeholder = "Type course name";
    codeInput.focus();
  } else {
    const idx = sel.value.indexOf('|');
    const code = idx === -1 ? sel.value : sel.value.slice(0, idx);
    const name = idx === -1 ? '' : sel.value.slice(idx + 1);
    codeInput.value = code; nameInput.value = name;
    codeInput.readOnly = true; nameInput.readOnly = true;
    codeInput.classList.add('bg-gray-100', 'dark:bg-gray-600'); nameInput.classList.add('bg-gray-100', 'dark:bg-gray-600');
  }
}

const AC_CATEGORY_ORDER = ['Higher Secondary', 'Honours', 'Masters'];
const AC_YEAR_MAP = { 'Higher Secondary': ['XI', 'XII'], 'Honours': ['1st Year', '2nd Year', '3rd Year', '4th Year'], 'Masters': ['Preliminary', 'Final'] };

function acFillYears(catId, yearId, selected) {
  const cat = document.getElementById(catId)?.value;
  const ySel = document.getElementById(yearId);
  if (!ySel) return;
  const years = AC_YEAR_MAP[cat] || [];
  ySel.innerHTML = years.map(y => `<option value="${attrEsc(y)}"${y === selected ? ' selected' : ''}>${escapeHtml(y)}</option>`).join('');
}

let acCoursesCache = [];

async function loadAcademicCourseList() {
  const box = document.getElementById('acCourseList');
  if (!box) return;
  box.innerHTML = `<div class="flex flex-col items-center justify-center py-8 gap-3"><div class="w-9 h-9 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div><p class="text-gray-500 dark:text-gray-400 text-sm">Loading...</p></div>`;
  try {
    const res = await withTimeout(db.from('courses_new').select('*').order('course_code'), 12000);
    if (res.error) throw res.error;
    acCoursesCache = res.data || [];
    renderAcademicCourseList();
  } catch (err) {
    box.innerHTML = `<div class="text-center py-6"><p class="text-red-500 mb-2">❌ Failed to load</p><p class="text-xs text-gray-400 mb-3">${escapeHtml(err.message || '')}</p><button onclick="loadAcademicCourseList()" class="bg-teal-600 text-white px-4 py-2 rounded-xl font-bold btn-pop">🔄 Retry</button></div>`;
  }
}

function renderAcademicCourseList() {
  const box = document.getElementById('acCourseList');
  if (!box) return;
  const filterCat = document.getElementById('acFilterCategory')?.value || '';
  const items = acCoursesCache.map((c, idx) => ({ c, idx })).filter(x => !filterCat || x.c.category === filterCat);
  const cnt = document.getElementById('acCourseCount');
  if (cnt) cnt.textContent = `(${items.length})`;

  if (!items.length) {
    box.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">No courses added yet</p>';
    return;
  }

  const catRank = c => { const i = AC_CATEGORY_ORDER.indexOf(c.category); return i === -1 ? 99 : i; };
  const yearRank = c => { const i = (AC_YEAR_MAP[c.category] || []).indexOf(c.year_name); return i === -1 ? 99 : i; };
  items.sort((x, y) => catRank(x.c) - catRank(y.c) || yearRank(x.c) - yearRank(y.c) || String(x.c.course_code || '').localeCompare(String(y.c.course_code || ''), undefined, { numeric: true }));

  const groups = {};
  items.forEach(x => {
    const key = `${x.c.category || '—'} · ${x.c.year_name || '—'}`;
    (groups[key] = groups[key] || []).push(x);
  });

  box.innerHTML = Object.entries(groups).map(([title, list]) => `
    <div class="mb-4">
      <p class="text-xs font-bold text-teal-700 dark:text-teal-300 mb-1">${escapeHtml(title)} <span class="text-gray-400">(${list.length})</span></p>
      ${list.map(({ c, idx }) => `
        <div class="flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded-lg mb-1">
          <div class="min-w-0 flex-1">
            <p class="font-bold text-sm dark:text-white break-words"><span class="num-display">${escapeHtml(c.course_code)}</span> - ${escapeHtml(c.short_code || c.course_name || '')}</p>
            ${c.short_code && c.course_name ? `<p class="text-xs text-gray-500 dark:text-gray-400 break-words">${escapeHtml(c.course_name)}</p>` : ''}
          </div>
          <button onclick="editAcademicCourse(${idx})" class="bg-amber-100 text-amber-700 hover:bg-amber-500 hover:text-white px-2 py-1 rounded text-sm transition btn-pop" title="Edit">✏️</button>
          <button onclick="deleteAcademicCourse(${idx})" class="bg-red-100 text-red-600 hover:bg-red-600 hover:text-white px-2 py-1 rounded text-sm transition btn-pop" title="Delete">🗑️</button>
        </div>`).join('')}
    </div>`).join('');
}

async function getCourseUsage(code) {
  const codes = [...new Set([String(code), String(code).toUpperCase()])];
  const out = { mapped: 0, routine: 0, sessions: 0 };
  try {
    const { data } = await db.from('teacher_courses').select('id, class_day, time_slot').in('course_code', codes);
    (data || []).forEach(r => { out.mapped++; if (r.class_day && r.time_slot) out.routine++; });
  } catch (e) { console.warn(e); }
  try {
    const { count } = await db.from('attendance_sessions').select('id', { count: 'exact', head: true }).in('course_code', codes);
    out.sessions = count || 0;
  } catch (e) { console.warn(e); }
  return out;
}

// ============================================================
// EXAM TYPES — Academic মেনুর অংশ। নম্বর-ইনপুট, রিপোর্ট ও (পরে) পরীক্ষা-রুটিন সবখানে একই তালিকা
// ============================================================
let examTypesCache = {};
let acExamRows = [];

function invalidateExamTypes() { examTypesCache = {}; }

async function getExamTypes(includeInactive = false) {
  const key = includeInactive ? 'all' : 'active';
  if (examTypesCache[key]) return examTypesCache[key];
  try {
    let q = db.from('exam_types').select('id, name, default_minutes, counts_in_total, is_active, sort_order').order('sort_order').order('name');
    if (!includeInactive) q = q.eq('is_active', true);
    const { data, error } = await withTimeout(q, 10000);
    if (error) throw error;
    examTypesCache[key] = data || [];
    return examTypesCache[key];
  } catch (e) {
    console.warn('Exam types load failed, using built-in list', e);
    return STD_EXAMS.map((name, i) => ({ id: null, name, default_minutes: i >= 5 ? 180 : 45, counts_in_total: i < 5, is_active: true, sort_order: (i + 1) * 10 }));
  }
}

function etFmtMinutes(m) {
  m = Number(m) || 0;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function acSwitch(pane) {
  const c = document.getElementById('acPaneCourses'), e = document.getElementById('acPaneExams');
  if (!c || !e) return;
  const showExams = pane === 'exams';
  c.classList.toggle('hidden', showExams);
  e.classList.toggle('hidden', !showExams);
  const tc = document.getElementById('acTabCourses'), te = document.getElementById('acTabExams');
  if (tc) tc.classList.toggle('active', !showExams);
  if (te) te.classList.toggle('active', showExams);
  if (showExams) loadExamTypeList();
}

async function loadExamTypeList() {
  const box = document.getElementById('etList');
  if (!box) return;
  box.innerHTML = `<div class="flex flex-col items-center justify-center py-8 gap-3"><div class="w-9 h-9 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div><p class="text-gray-500 dark:text-gray-400 text-sm">Loading...</p></div>`;
  try {
    const res = await withTimeout(db.from('exam_types').select('*').order('sort_order').order('name'), 12000);
    if (res.error) throw res.error;
    const rows = res.data || [];
    const counts = await Promise.all(rows.map(r =>
      db.from('marks').select('id', { count: 'exact', head: true }).eq('exam_type', r.name).then(x => x.count || 0).catch(() => 0)));
    acExamRows = rows.map((r, i) => ({ ...r, used: counts[i] }));
    renderExamTypeList();
  } catch (err) {
    box.innerHTML = `<div class="text-center py-6"><p class="text-red-500 mb-2">❌ Failed to load</p><p class="text-xs text-gray-400 mb-3">${escapeHtml(err.message || '')}</p><button onclick="loadExamTypeList()" class="bg-teal-600 text-white px-4 py-2 rounded-lg btn-pop">Retry</button></div>`;
  }
}

function renderExamTypeList() {
  const box = document.getElementById('etList');
  if (!box) return;
  const cnt = document.getElementById('etCount');
  if (cnt) cnt.textContent = `(${acExamRows.length})`;
  if (!acExamRows.length) { box.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">No exam types yet. Add one above.</p>'; return; }
  box.innerHTML = acExamRows.map((r, idx) => `
    <div class="flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded-lg mb-1 ${r.is_active ? '' : 'opacity-60'}">
      <div class="min-w-0 flex-1">
        <p class="font-bold text-sm dark:text-white break-words">${escapeHtml(r.name)}</p>
        <div class="flex flex-wrap gap-1 mt-1">
          <span class="text-[11px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200 px-2 py-0.5 rounded-full">⏱ ${escapeHtml(etFmtMinutes(r.default_minutes))}</span>
          ${r.counts_in_total ? '<span class="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Counts in Total</span>' : ''}
          ${r.is_active ? '' : '<span class="text-[11px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Inactive</span>'}
          <span class="text-[11px] ${r.used ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'} px-2 py-0.5 rounded-full">${r.used ? `Used in ${r.used} marks` : 'Not used yet'}</span>
        </div>
      </div>
      <button onclick="editExamType(${idx})" class="bg-amber-100 text-amber-700 hover:bg-amber-500 hover:text-white px-2 py-1 rounded text-sm transition btn-pop" title="Edit">✏️</button>
      <button onclick="toggleExamType(${idx})" class="bg-sky-100 text-sky-700 hover:bg-sky-600 hover:text-white px-2 py-1 rounded text-sm transition btn-pop" title="${r.is_active ? 'Deactivate' : 'Activate'}">${r.is_active ? '🚫' : '✅'}</button>
      <button onclick="deleteExamType(${idx})" class="bg-red-100 text-red-600 hover:bg-red-600 hover:text-white px-2 py-1 rounded text-sm transition btn-pop" title="Delete">🗑️</button>
    </div>`).join('');
}

function etFriendlyError(e) {
  const m = (e && e.message) || 'Failed';
  if (/duplicate|unique/i.test(m)) return 'This exam name already exists';
  return m;
}

async function addExamType() {
  const name = (document.getElementById('etName').value || '').trim().replace(/\s+/g, ' ');
  const mins = parseInt(document.getElementById('etMinutes').value, 10);
  const counts = document.getElementById('etTotal').checked;
  if (!name) return toastWarning('Enter exam name');
  if (name.length > 60) return toastWarning('Name is too long (max 60 characters)');
  if (!mins || mins < 5 || mins > 600) return toastWarning('Duration must be 5 to 600 minutes');
  if (acExamRows.some(r => r.name.toLowerCase() === name.toLowerCase())) return toastWarning('This exam name already exists');
  showGlobalLoader();
  try {
    const maxSort = Math.max(0, ...acExamRows.map(r => r.sort_order || 0));
    const { error } = await db.from('exam_types').insert({ name, default_minutes: mins, counts_in_total: counts, sort_order: maxSort + 10 });
    if (error) throw error;
    invalidateExamTypes();
    document.getElementById('etName').value = '';
    document.getElementById('etMinutes').value = 45;
    document.getElementById('etTotal').checked = false;
    toastSuccess('Exam type added');
    await loadExamTypeList();
  } catch (e) { toastError(etFriendlyError(e)); } finally { hideGlobalLoader(); }
}

async function editExamType(idx) {
  const r = acExamRows[idx];
  if (!r) return;
  const st = 'width:100%;margin:2px 0 10px;padding:9px;border:2px solid #d1d5db;border-radius:10px;font-size:15px;color:#111;background:#fff;box-sizing:border-box';
  const lb = 'display:block;font-size:12px;font-weight:700;color:#4b5563;text-align:left';
  const res = await Swal.fire({
    title: '✏️ Edit Exam Type',
    html: `<div><label style="${lb}">Exam name</label><input id="swEtName" maxlength="60" style="${st}" value="${attrEsc(r.name)}">
      <label style="${lb}">Default duration (minutes)</label><input id="swEtMin" type="number" min="5" max="600" step="5" style="${st}" value="${attrEsc(r.default_minutes)}">
      <label style="display:flex;gap:8px;align-items:center;font-size:14px;color:#111;text-align:left"><input id="swEtTotal" type="checkbox" ${r.counts_in_total ? 'checked' : ''}> Counts in course Total</label>
      ${r.used ? `<p style="font-size:12px;color:#b45309;margin-top:10px;text-align:left">ℹ️ ${r.used} marks use this name. If you rename it, they move to the new name automatically.</p>` : ''}</div>`,
    showCancelButton: true, confirmButtonText: 'Update', cancelButtonText: 'Cancel', confirmButtonColor: '#0d9488', focusConfirm: false,
    preConfirm: () => {
      const v = { name: document.getElementById('swEtName').value.trim().replace(/\s+/g, ' '), mins: parseInt(document.getElementById('swEtMin').value, 10), counts: document.getElementById('swEtTotal').checked };
      if (!v.name) { Swal.showValidationMessage('Enter exam name'); return false; }
      if (!v.mins || v.mins < 5 || v.mins > 600) { Swal.showValidationMessage('Duration must be 5 to 600 minutes'); return false; }
      return v;
    }
  });
  if (!res.isConfirmed) return;
  const v = res.value;
  if (acExamRows.some((o, i) => i !== idx && o.name.toLowerCase() === v.name.toLowerCase())) return toastWarning('This exam name already exists');
  showGlobalLoader();
  try {
    let moved = 0;
    if (v.name !== r.name) {
      const { data, error } = await db.rpc('admin_rename_exam_type', { p_id: r.id, p_new_name: v.name });
      if (error) throw error;
      moved = (data && data.marks_updated) || 0;
    }
    const { error: uErr } = await db.from('exam_types').update({ default_minutes: v.mins, counts_in_total: v.counts }).eq('id', r.id);
    if (uErr) throw uErr;
    invalidateExamTypes();
    toastSuccess(moved ? `Updated (${moved} marks moved to the new name)` : 'Exam type updated');
    await loadExamTypeList();
  } catch (e) { toastError(etFriendlyError(e)); } finally { hideGlobalLoader(); }
}

async function toggleExamType(idx) {
  const r = acExamRows[idx];
  if (!r) return;
  showGlobalLoader();
  try {
    const { error } = await db.from('exam_types').update({ is_active: !r.is_active }).eq('id', r.id);
    if (error) throw error;
    invalidateExamTypes();
    toastSuccess(r.is_active ? 'Deactivated — hidden from new dropdowns' : 'Activated');
    await loadExamTypeList();
  } catch (e) { toastError(etFriendlyError(e)); } finally { hideGlobalLoader(); }
}

async function deleteExamType(idx) {
  const r = acExamRows[idx];
  if (!r) return;
  if (r.used > 0) {
    const ok = await Swal.fire({
      icon: 'info', title: 'Cannot delete', showCancelButton: r.is_active, confirmButtonText: r.is_active ? 'Deactivate instead' : 'OK', cancelButtonText: 'Cancel', confirmButtonColor: '#0d9488',
      html: `<div style="text-align:left;font-size:14px"><b>${escapeHtml(r.name)}</b> is used in <b>${r.used}</b> marks records, so deleting it is blocked to protect them.${r.is_active ? '<br><br>You can <b>deactivate</b> it: it disappears from new dropdowns, but old marks stay safe.' : ''}</div>`
    });
    if (ok.isConfirmed && r.is_active) await toggleExamType(idx);
    return;
  }
  const ok = await Swal.fire({
    icon: 'warning', title: 'Delete exam type?', showCancelButton: true, confirmButtonText: 'Yes, delete', cancelButtonText: 'Cancel', confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280', reverseButtons: true,
    html: `<div style="text-align:left;font-size:14px"><b>${escapeHtml(r.name)}</b> has no marks yet. Delete it?</div>`
  });
  if (!ok.isConfirmed) return;
  showGlobalLoader();
  try {
    const { error } = await db.from('exam_types').delete().eq('id', r.id);
    if (error) throw error;
    invalidateExamTypes();
    toastSuccess('Exam type deleted');
    await loadExamTypeList();
  } catch (e) { toastError(etFriendlyError(e)); } finally { hideGlobalLoader(); }
}

function acMatch(q, c) {
  if (c.id !== undefined && c.id !== null) return q.eq('id', c.id);
  return q.eq('category', c.category).eq('year_name', c.year_name).eq('course_code', c.course_code);
}

async function editAcademicCourse(idx) {
  const c = acCoursesCache[idx];
  if (!c) return;
  const st = 'width:100%;margin:2px 0 10px;padding:9px;border:2px solid #d1d5db;border-radius:10px;font-size:15px;color:#111;background:#fff;box-sizing:border-box';
  const lb = 'display:block;font-size:12px;font-weight:700;color:#4b5563;text-align:left';
  const cats = AC_CATEGORY_ORDER.includes(c.category) || !c.category ? AC_CATEGORY_ORDER : [c.category, ...AC_CATEGORY_ORDER];

  const res = await Swal.fire({
    title: '✏️ Edit Course',
    html: `<div><label style="${lb}">Category</label><select id="swCat" style="${st}">${cats.map(k => `<option value="${attrEsc(k)}"${k === c.category ? ' selected' : ''}>${escapeHtml(k)}</option>`).join('')}</select><label style="${lb}">Year</label><select id="swYear" style="${st}"></select><label style="${lb}">Course Name</label><input id="swName" style="${st}" value="${attrEsc(c.course_name)}"><label style="${lb}">Course Code</label><input id="swCode" style="${st}" value="${attrEsc(c.course_code)}"><label style="${lb}">Short Code / Short Name</label><input id="swShort" style="${st}" value="${attrEsc(c.short_code)}"></div>`,
    showCancelButton: true, confirmButtonText: 'Update', cancelButtonText: 'Cancel', confirmButtonColor: '#0d9488', focusConfirm: false,
    didOpen: () => {
      const fill = (sel) => {
        acFillYears('swCat', 'swYear', sel);
        const ySel = document.getElementById('swYear');
        if (sel && ySel && ![...ySel.options].some(o => o.value === sel)) {
          const o = document.createElement('option'); o.value = sel; o.textContent = sel; o.selected = true; ySel.prepend(o);
        }
      };
      fill(c.year_name);
      document.getElementById('swCat').addEventListener('change', () => acFillYears('swCat', 'swYear'));
    },
    preConfirm: () => {
      const v = { category: document.getElementById('swCat').value, year_name: document.getElementById('swYear').value, course_name: document.getElementById('swName').value.trim(), course_code: document.getElementById('swCode').value.trim(), short_code: document.getElementById('swShort').value.trim() };
      if (!v.course_name || !v.course_code) { Swal.showValidationMessage('Enter course name and code'); return false; }
      return v;
    }
  });
  if (!res.isConfirmed) return;
  const v = res.value;

  const dup = acCoursesCache.some((o, i) => i !== idx && o.category === v.category && o.year_name === v.year_name && String(o.course_code).toLowerCase() === v.course_code.toLowerCase());
  if (dup) return toastWarning('This code already exists in this category/year');

  showGlobalLoader();
  try {
    if (v.course_code !== c.course_code) {
      const u = await getCourseUsage(c.course_code);
      if (u.mapped || u.routine || u.sessions) {
        hideGlobalLoader();
        const ok = await Swal.fire({
          icon: 'warning', title: 'Changing course code!',
          html: `<div style="text-align:left;font-size:14px">This course is in use:<br>• Teacher mappings: <b>${u.mapped}</b><br>• Routine slots: <b>${u.routine}</b><br>• Attendance sessions: <b>${u.sessions}</b><br><br>Old mappings/attendance will stay on the old code. Continue?</div>`,
          showCancelButton: true, confirmButtonText: 'Yes, change', cancelButtonText: 'Cancel', confirmButtonColor: '#dc2626', reverseButtons: true
        });
        if (!ok.isConfirmed) return;
        showGlobalLoader();
      }
    }
    const { error } = await acMatch(db.from('courses_new').update(v), c);
    if (error) throw error;
    invalidateCourseInfo();
    toastSuccess('Course updated');
    await loadAcademicCourseList();
  } catch (e) { toastError(e.message || 'Update failed'); } finally { hideGlobalLoader(); }
}

async function deleteAcademicCourse(idx) {
  const c = acCoursesCache[idx];
  if (!c) return;
  showGlobalLoader();
  let u;
  try { u = await getCourseUsage(c.course_code); } finally { hideGlobalLoader(); }

  const inUse = u.mapped > 0 || u.routine > 0;
  const label = `${c.course_code} - ${c.short_code || c.course_name || ''}`;
  const html = inUse
    ? `<div style="text-align:left;font-size:14px"><b>${escapeHtml(label)}</b><br><br>⚠️ <b>Warning:</b> This course is in use —<br>• Teacher mappings: <b>${u.mapped}</b><br>• Routine slots: <b>${u.routine}</b><br>${u.sessions ? `• Attendance sessions: <b>${u.sessions}</b><br>` : ''}<br>Deleting only removes from course list. Mappings/routine/attendance will remain. Continue?</div>`
    : `<div style="text-align:left;font-size:14px"><b>${escapeHtml(label)}</b><br><br>This course is not mapped anywhere. Delete it?</div>`;

  const ok = await Swal.fire({
    icon: 'warning', title: inUse ? '⚠️ Course is in use!' : 'Delete course?', html, showCancelButton: true, confirmButtonText: 'Yes, delete', cancelButtonText: 'Cancel', confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280', reverseButtons: true
  });
  if (!ok.isConfirmed) return;

  showGlobalLoader();
  try {
    const { error } = await acMatch(db.from('courses_new').delete(), c);
    if (error) throw error;
    invalidateCourseInfo();
    toastSuccess('Course deleted');
    await loadAcademicCourseList();
  } catch (e) { toastError(e.message || 'Delete failed'); } finally { hideGlobalLoader(); }
}

async function importCoursesExcel() {
  const file = document.getElementById('courseExcelFile')?.files[0];
  if (!file) return toastWarning('Select Excel file');
  const cat = document.getElementById('acCategory').value, year = document.getElementById('acYear').value;
  if (!year) return toastWarning('Select category and year');
  showGlobalLoader();
  try {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }).slice(1);
    const have = new Set(acCoursesCache.filter(c => c.category === cat && c.year_name === year).map(c => String(c.course_code).toLowerCase()));
    const seen = new Set(), add = [];
    rows.forEach(r => {
      const code = String(r[0] ?? '').trim(), name = String(r[1] ?? '').trim(), short = String(r[2] ?? '').trim();
      if (!code || !name || have.has(code.toLowerCase()) || seen.has(code.toLowerCase())) return;
      seen.add(code.toLowerCase());
      add.push({ category: cat, year_name: year, course_code: code, course_name: name, short_code: short });
    });
    if (!add.length) return toastWarning('Nothing new to import');
    const { error } = await db.from('courses_new').insert(add);
    if (error) throw error;
    invalidateCourseInfo();
    toastSuccess(`${add.length} courses added`);
    document.getElementById('courseExcelFile').value = '';
    loadAcademicCourseList();
  } catch (e) { toastError(e.message || 'Import failed'); } finally { hideGlobalLoader(); }
}
async function addAcademicCourse() {
  const cat = document.getElementById('acCategory').value;
  const year = document.getElementById('acYear').value;
  const name = document.getElementById('acName').value.trim();
  const code = document.getElementById('acCode').value.trim();
  const short = document.getElementById('acShort').value.trim();
  if (!name || !code) return toastWarning('Enter course name and code');
  if (!year) return toastWarning('Select year');
  if (acCoursesCache.some(o => o.category === cat && o.year_name === year && String(o.course_code).toLowerCase() === code.toLowerCase())) {
    return toastWarning('This code already exists in this category/year');
  }
  showGlobalLoader();
  try {
    const { error } = await db.from('courses_new').insert([{ category: cat, year_name: year, course_name: name, course_code: code, short_code: short }]);
    if (error) throw error;
    invalidateCourseInfo();
    toastSuccess('Course added');
    document.getElementById('acName').value = '';
    document.getElementById('acCode').value = '';
    document.getElementById('acShort').value = '';
    loadAcademicCourseList();
  } catch (e) { toastError(e.message); } finally { hideGlobalLoader(); }
}

// ============================================================
// MAPPING
// ============================================================
function slotChips(slots) {
  return sortRoutineData(slots || []).map(x => `<span class="chip chip-slot num-display">${escapeHtml(x.class_day.slice(0, 3))} · ${escapeHtml(x.time_slot)}${x.room ? ' · 🚪 ' + escapeHtml(x.room) : ''}</span>`).join('');
}
function normKey(v) { return String(v ?? '').trim().toLowerCase(); }

async function checkScheduleConflict({ teacherId, courseCode, year, day, time, room, excludeId }) {
  const { data, error } = await db.from('teacher_courses').select('*').eq('class_day', day).eq('time_slot', time);
  if (error) throw error;
  const rows = (data || []).filter(r => !excludeId || String(r.id) !== String(excludeId));
  const tRow = rows.find(r => String(r.teacher_id) === String(teacherId));
  const cRow = rows.find(r => normKey(r.course_code) === normKey(courseCode) && normKey(r.year) === normKey(year));
  const rRow = room ? rows.find(r => r.room && normKey(r.room) === normKey(room)) : null;
  if (!tRow && !cRow && !rRow) return [];
  await getCourseInfoMap();
  const ids = [...new Set([tRow, cRow, rRow].filter(Boolean).map(r => r.teacher_id).filter(Boolean))];
  const nameOf = {};
  if (ids.length) {
    const { data: ts } = await db.from('teachers').select('id, name').in('id', ids);
    (ts || []).forEach(t => { nameOf[t.id] = t.name; });
  }
  const out = [];
  if (tRow) out.push(`👨‍🏫 This teacher is already booked at this time: <b>${escapeHtml(courseLabel(tRow.course_code))}</b>.`);
  if (cRow) out.push(`📚 Course <b>${escapeHtml(courseLabel(cRow.course_code))}</b> is already assigned at this time (${escapeHtml(nameOf[cRow.teacher_id] || 'unknown teacher')}).`);
  if (rRow) out.push(`🚪 Room <b>${escapeHtml(rRow.room)}</b> is already used at this time by <b>${escapeHtml(courseLabel(rRow.course_code))}</b> (${escapeHtml(nameOf[rRow.teacher_id] || 'unknown teacher')}).`);
  return out;
}

function showConflictAlert(list, day, time) {
  return Swal.fire({
    icon: 'warning', title: '⚠️ Conflict!',
    html: `<div style="text-align:left;font-size:14px"><p style="margin-bottom:8px"><b>This teacher/course is already booked at this time.</b></p><p style="margin-bottom:8px;color:#6b7280">${escapeHtml(day)} · ${escapeHtml(time)}</p>${list.map(t => `<p style="margin:6px 0">${t}</p>`).join('')}<p style="margin-top:10px;color:#6b7280;font-size:12px">Choose another day/time or teacher. Nothing was saved.</p></div>`,
    confirmButtonText: 'OK', confirmButtonColor: '#dc2626'
  });
}

async function loadTeachersDropdown() {
  const { data } = await db.from('teachers').select('id, name').order('name');
  const opts = data?.map(t => `<option value="${attrEsc(t.id)}">${escapeHtml(t.name)}</option>`).join('') || '';
  const mapSel = document.getElementById('mapTeacher');
  if (mapSel) mapSel.innerHTML = '<option value="">Select teacher</option>' + opts;
}

function isRoomColumnError(e) {
  const m = String((e && e.message) || '');
  return /room/i.test(m) && /(column|schema cache)/i.test(m);
}

function showRoomDbNotice() {
  return Swal.fire({
    icon: 'info', title: 'Room column missing',
    html: '<div style="text-align:left;font-size:14px">Run <b>run_this.sql</b> once in the Supabase SQL Editor to add the Room field, then save again.</div>',
    confirmButtonText: 'OK', confirmButtonColor: '#4f46e5'
  });
}

async function sameCourseRows({ teacher_id, year, course_code }) {
  const { data, error } = await db.from('teacher_courses').select('id, class_day, time_slot')
    .eq('teacher_id', teacher_id).eq('year', year).eq('course_code', course_code);
  if (error) throw error;
  return data || [];
}

function showMultiDayDbNotice() {
  return Swal.fire({
    icon: 'info', title: 'Database rule needs a one-time update',
    html: '<div style="text-align:left;font-size:14px">The database still allows only one row per teacher + course. Run <b>run_this.sql</b> once in the Supabase SQL Editor, then save again.</div>',
    confirmButtonText: 'OK', confirmButtonColor: '#4f46e5'
  });
}

async function saveMapping() {
  const teacher_id = document.getElementById('mapTeacher').value;
  const year = yearCodeOf(document.getElementById('mapCategory').value, document.getElementById('mapYearName').value);
  const course_code = document.getElementById('mapCourse').value.trim().toUpperCase();
  const class_day = document.getElementById('mapDay').value;
  const time_slot = document.getElementById('mapTime').value;
  const room = (document.getElementById('mapRoom')?.value || '').trim().toUpperCase();
  if (room && !ROOM_RE.test(room)) return toastWarning('Room: letters, numbers, space, - or / only (e.g. ECO-1, 101)');
  if (!teacher_id || !year || !course_code) return toastWarning('Select teacher, category, year and course');
  if (!!class_day !== !!time_slot) return toastWarning('Select both day and time (or leave both empty)');
  showGlobalLoader();
  try {
    if (class_day) {
      let conflicts;
      try { conflicts = await checkScheduleConflict({ teacherId: teacher_id, courseCode: course_code, year, day: class_day, time: time_slot, room }); }
      catch (e) { return toastError('Conflict check failed: ' + (e.message || 'network issue')); }
      if (conflicts.length) { hideGlobalLoader(); return showConflictAlert(conflicts, class_day, time_slot); }
    }
    const rows = await sameCourseRows({ teacher_id, year, course_code });
    if (class_day && rows.some(r => r.class_day === class_day)) return toastWarning(`This course already has a class on ${class_day}`);
    if (!class_day && rows.length) return toastWarning('This mapping already exists');
    const blank = class_day ? rows.find(r => !r.class_day) : null;
    if (blank) {
      const { error } = await db.from('teacher_courses').update({ class_day, time_slot, ...(room ? { room } : {}) }).eq('id', blank.id);
      if (error) { if (isRoomColumnError(error)) { hideGlobalLoader(); return showRoomDbNotice(); } return toastError(error.message); }
      toastSuccess('Day & time added to the existing mapping');
    } else {
      const { error: e1 } = await db.from('teacher_courses').insert({ teacher_id, session: 'ALL', year, course_code, class_day: class_day || null, time_slot: time_slot || null, ...(room ? { room } : {}) });
      if (e1) {
        if (isRoomColumnError(e1)) { hideGlobalLoader(); return showRoomDbNotice(); }
        if (/teacher_courses_slot_/.test(e1.message || '')) return toastWarning('Teacher, course or room is already booked at this day & time');
        if (e1.code === '23505' || /duplicate/i.test(e1.message || '')) { hideGlobalLoader(); return showMultiDayDbNotice(); }
        return toastError(e1.message);
      }
      toastSuccess('Mapping & routine saved');
    }
    document.getElementById('mapCourseSelect').value = '';
    const rmEl = document.getElementById('mapRoom'); if (rmEl) rmEl.value = '';
    fillCourseDetails();
    loadMappings();
  } finally { hideGlobalLoader(); }
}

let mappingCache = [];
let mappingNames = {};

async function loadMappings() {
  const box = document.getElementById('mappingList');
  if (!box) return;
  box.innerHTML = '<div class="skeleton h-14 mb-2"></div><div class="skeleton h-14 mb-2"></div>';
  const { data, error } = await db.from('teacher_courses').select('*, teachers(name)').order('created_at', { ascending: false }).limit(500);
  if (error) { box.innerHTML = `<p class="text-red-500 text-sm">${escapeHtml(error.message)}</p>`; return; }
  mappingCache = data || [];
  mappingNames = {};
  try {
    const { data: cs } = await db.from('courses').select('session, year, course_code, course_name');
    (cs || []).forEach(c => { mappingNames[`${c.session}|${c.year}|${c.course_code}`] = c.course_name; });
  } catch (e) { console.warn(e); }
  await getCourseInfoMap();
  renderMappings();
}

function renderMappings() {
  const box = document.getElementById('mappingList');
  if (!box) return;
  const q = (document.getElementById('mapSearch')?.value || '').trim().toLowerCase();
  const label = m => courseLabel(m.course_code, mappingNames[`${m.session}|${m.year}|${m.course_code}`]);
  const rows = mappingCache.filter(m => !q || [m.teachers?.name, label(m), m.class_day, m.time_slot, m.session, m.year].join(' ').toLowerCase().includes(q));
  const cnt = document.getElementById('mapCount');
  if (cnt) cnt.textContent = `(${rows.length})`;
  if (!rows.length) { box.innerHTML = '<p class="text-gray-400 text-sm py-4 text-center">No mappings</p>'; return; }
  const groups = {};
  rows.forEach(m => { const n = m.teachers?.name || 'Unknown'; (groups[n] = groups[n] || []).push(m); });
  box.innerHTML = Object.keys(groups).sort().map(name => {
    const items = sortRoutineData(groups[name].map(m => ({ ...m, class_day: m.class_day || 'ZZ' })));
    return `<div class="map-group">
      <p class="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300 mb-2">👨‍🏫 ${escapeHtml(name)} <span class="text-gray-400">· ${items.length}</span></p>
      ${items.map(m => `<div class="map-row">
        <div class="min-w-0 flex-1 dark:text-white">
          <b class="num-display text-sm break-words">${escapeHtml(label(m))}</b>
          <div>${m.class_day !== 'ZZ' && m.time_slot ? `<span class="chip chip-day">${escapeHtml(m.class_day)}</span><span class="chip chip-slot num-display">${escapeHtml(m.time_slot)}</span>${m.room ? `<span class="chip chip-day">🚪 ${escapeHtml(m.room)}</span>` : ''}` : '<span class="chip chip-none">No schedule</span>'}<span class="chip bg-gray-100 text-gray-600 num-display">${escapeHtml(yearLabel(m.year))}</span></div>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button onclick="editMapping('${escapeHtml(m.id)}')" class="bg-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white px-2.5 py-1.5 rounded-lg text-xs btn-pop" title="Edit">✏️</button>
          <button onclick="deleteMapping('${escapeHtml(m.id)}')" class="bg-red-100 text-red-600 hover:bg-red-600 hover:text-white px-2.5 py-1.5 rounded-lg text-xs btn-pop" title="Delete">🗑️</button>
        </div>
      </div>`).join('')}
    </div>`;
  }).join('');
}

async function editMapping(id) {
  const m = mappingCache.find(x => String(x.id) === String(id));
  if (!m) return toastError('Mapping not found — refresh the list');
  const { data: ts } = await db.from('teachers').select('id, name').order('name');
  const sel = (v, cur) => (String(v) === String(cur) ? 'selected' : '');
  const tOpts = (ts || []).map(t => `<option value="${attrEsc(t.id)}" ${sel(t.id, m.teacher_id)}>${escapeHtml(t.name)}</option>`).join('');
  const dOpts = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'].map(d => `<option value="${d}" ${sel(d, m.class_day || '')}>${d || '— No day —'}</option>`).join('');
  const tmOpts = ['', ...ROUTINE_TIME_ORDER].map(t => `<option value="${t}" ${sel(t, m.time_slot || '')}>${t || '— No time —'}</option>`).join('');
  const st = 'width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:12px;margin-bottom:10px;font-size:14px';
  const r = await Swal.fire({
    title: 'Edit mapping',
    html: `<div style="text-align:left"><p style="font-size:13px;color:#6b7280;margin-bottom:10px"><b>${escapeHtml(courseLabel(m.course_code, mappingNames[`${m.session}|${m.year}|${m.course_code}`]))}</b> · ${escapeHtml(yearLabel(m.year))}</p>
      <label style="font-size:12px;font-weight:700">Teacher</label><select id="emTeacher" style="${st}">${tOpts}</select>
      <label style="font-size:12px;font-weight:700">Day</label><select id="emDay" style="${st}">${dOpts}</select>
      <label style="font-size:12px;font-weight:700">Time</label><select id="emTime" style="${st}">${tmOpts}</select>
      <label style="font-size:12px;font-weight:700">Room No.</label><input id="emRoom" value="${attrEsc(m.room || '')}" maxlength="20" placeholder="e.g. ECO-1, 101" style="${st};text-transform:uppercase"></div>`,
    showCancelButton: true, confirmButtonText: 'Save', confirmButtonColor: '#4f46e5',
    preConfirm: () => ({ teacher_id: document.getElementById('emTeacher').value, class_day: document.getElementById('emDay').value, time_slot: document.getElementById('emTime').value, room: document.getElementById('emRoom').value.trim().toUpperCase() })
  });
  if (!r.isConfirmed) return;
  const { teacher_id, class_day, time_slot, room } = r.value;
  if (room && !ROOM_RE.test(room)) return toastWarning('Room: letters, numbers, space, - or / only (e.g. ECO-1, 101)');
  if (!!class_day !== !!time_slot) return toastWarning('Select both day and time (or clear both)');
  showGlobalLoader();
  try {
    if (class_day) {
      const conflicts = await checkScheduleConflict({ teacherId: teacher_id, courseCode: m.course_code, session: m.session, year: m.year, day: class_day, time: time_slot, room, excludeId: m.id });
      if (conflicts.length) { hideGlobalLoader(); return showConflictAlert(conflicts, class_day, time_slot); }
      const rows = (await sameCourseRows({ teacher_id, session: m.session, year: m.year, course_code: m.course_code })).filter(x => String(x.id) !== String(m.id));
      if (rows.some(x => x.class_day === class_day)) return toastWarning(`This course already has a class on ${class_day}`);
    }
    const upd = { teacher_id, class_day: class_day || null, time_slot: time_slot || null };
    if ('room' in m || room) upd.room = room || null;
    const { error } = await db.from('teacher_courses').update(upd).eq('id', m.id);
    if (error) {
      if (isRoomColumnError(error)) { hideGlobalLoader(); return showRoomDbNotice(); }
      if (/teacher_courses_slot_/.test(error.message || '')) { return toastWarning('Teacher, course or room is already booked at this day & time'); }
      if (error.code === '23505') { hideGlobalLoader(); return showMultiDayDbNotice(); }
      return toastError(error.message);
    }
    toastSuccess('Mapping updated');
    loadMappings();
  } catch (e) { toastError(e.message || 'Update failed'); } finally { hideGlobalLoader(); }
}

async function deleteMapping(id) {
  const ok = await confirmAction('Delete?', 'Deleting this mapping also removes it from the routine. Previous attendance and marks remain.', 'Yes, delete', '#dc2626');
  if (!ok) return;
  showGlobalLoader();
  try {
    const { error } = await db.from('teacher_courses').delete().eq('id', id);
    if (error) throw error;
    toastSuccess('Mapping deleted');
    loadMappings();
  } catch (e) { toastError(e.message); } finally { hideGlobalLoader(); }
}
