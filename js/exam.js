/* js/exam.js — পরীক্ষার সময়সূচি (Exam Schedule) */
/* ============================================================
   EXAM SCHEDULE (Admin). Separate script block: an error here cannot affect the rest of the app.
   Data flow: Class (Academic) -> Session year (Students) -> Exam name (Academic > Exam Types)
              -> Dates -> Course (Academic) -> Time -> Rooms -> Invigilators (Teachers, active only)
   ============================================================ */
const EXS = { list: [], teachers: [], examTypes: [], courses: [], sessionYears: [], form: null, uid: 0 };
const EXS_IN = 'w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600';
const EXS_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EXS_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EXS_ROOM_RE = /^[A-Za-z0-9][A-Za-z0-9 \/-]{0,19}$/;

function exsUid() { return ++EXS.uid; }

// ---------- date / time helpers ----------
function exsParseDate(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function exsDayName(s) { const d = exsParseDate(s); return d ? EXS_DAYS[d.getDay()] : ''; }
function exsFmtDate(s) { const d = exsParseDate(s); return d ? `${String(d.getDate()).padStart(2, '0')} ${EXS_MON[d.getMonth()]} ${d.getFullYear()}` : ''; }
function exsMin(v) { const m = /^(\d{1,2}):(\d{2})/.exec(v || ''); return m ? (+m[1]) * 60 + (+m[2]) : NaN; }
function exsTo12(v) { const t = exsMin(v); const h24 = Math.floor(t / 60), m = t % 60; return { h: (h24 % 12) || 12, m, ap: h24 >= 12 ? 'PM' : 'AM' }; }
function exsFrom12(h, m, ap) { const h24 = (h % 12) + (ap === 'PM' ? 12 : 0); return String(h24).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }
function exsFmt12(v) { if (!/^\d/.test(v || '')) return ''; const t = exsTo12(v); return `${t.h}:${String(t.m).padStart(2, '0')} ${t.ap}`; }
function exsAddMinutes(v, mins) { const t = Math.min(23 * 60 + 59, exsMin(v) + mins); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
function exsDuration() {
  const f = EXS.form; const et = f && EXS.examTypes.find(e => e.id === f.exam_type_id);
  return et ? et.default_minutes : 45;
}
function exsFmtDur(mins) { if (!(mins > 0)) return ''; const h = Math.floor(mins / 60), r = mins % 60; return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`; }
function exsCatYear(code) { for (const [cat, g] of Object.entries(YEAR_GROUPS)) { const f = g.find(x => x[1] === code); if (f) return { cat, yearName: f[0] }; } return null; }

// ---------- data loading ----------
async function exsLoadBase() {
  const [tRes, ets] = await Promise.all([
    withTimeout(db.from('teachers').select('id, name, is_active, is_admin').order('name'), 12000),
    getExamTypes(true),
    getCourseInfoMap(true)
  ]);
  if (tRes.error) throw tRes.error;
  EXS.teachers = tRes.data || [];
  EXS.examTypes = ets || [];
}
function exsTeacherName(id) { const t = EXS.teachers.find(x => x.id === id); return t ? t.name : '(unknown)'; }

function exsNormalize(row) {
  const slots = (row.exam_slots || []).map(sl => ({
    id: sl.id, date: sl.exam_date, day: exsDayName(sl.exam_date), course_code: sl.course_code,
    start: (sl.start_time || '').slice(0, 5), end: (sl.end_time || '').slice(0, 5),
    rooms: (sl.exam_rooms || []).slice().sort((a, b) => ((a.sort_order || 0) - (b.sort_order || 0)) || String(a.room_no).localeCompare(String(b.room_no))).map(r => {
      const ids = (r.exam_invigilators || []).map(i => i.teacher_id);
      return { room_no: r.room_no, teacher_ids: ids, invigilators: ids.map(exsTeacherName).sort() };
    })
  })).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return { id: row.id, exam_type_id: row.exam_type_id, exam_name: (row.exam_types && row.exam_types.name) || '', session_year: row.session_year, year: row.year, is_published: !!row.is_published, slots };
}

async function exsLoadList() {
  const res = await withTimeout(db.from('exam_schedules').select('id, session_year, year, exam_type_id, is_published, exam_types(name), exam_slots(id, exam_date, course_code, start_time, end_time, exam_rooms(id, room_no, sort_order, exam_invigilators(teacher_id)))').order('session_year', { ascending: false }), 15000);
  if (res.error) throw res.error;
  EXS.list = (res.data || []).map(exsNormalize).sort((a, b) => (b.session_year - a.session_year) || ((b.slots[0] ? b.slots[0].date : '').localeCompare(a.slots[0] ? a.slots[0].date : '')));
}

async function exsOpenTab(el) {
  el.innerHTML = '<div id="exsRoot"><div class="text-center py-8 text-gray-500">Loading...</div></div>';
  try {
    await exsLoadBase();
    await exsLoadList();
    if (currentAdminTab !== 'examSchedule') return;
    exsRenderList();
  } catch (err) {
    const root = document.getElementById('exsRoot');
    if (root) root.innerHTML = `<div class="text-center py-8"><p class="text-red-500 mb-2">❌ Failed to load</p><p class="text-xs text-gray-400 mb-3">${escapeHtml(err.message || '')}</p><button onclick="showAdminTab('examSchedule')" class="bg-indigo-600 text-white px-4 py-2 rounded-lg btn-pop">Retry</button></div>`;
  }
}

// ---------- list view ----------
function exsRoot() { return document.getElementById('exsRoot'); }
function exsRenderList() {
  const root = exsRoot(); if (!root) return;
  const card = s => {
    const dates = s.slots.map(x => x.date);
    const range = dates.length ? (dates[0] === dates[dates.length - 1] ? exsFmtDate(dates[0]) : `${exsFmtDate(dates[0])} → ${exsFmtDate(dates[dates.length - 1])}`) : 'No dates yet';
    return `<div class="bg-white dark:bg-gray-800 border-2 ${s.is_published ? 'border-emerald-200 dark:border-emerald-800' : 'border-amber-200 dark:border-amber-800'} rounded-xl p-4 mb-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="font-bold dark:text-white break-words">${escapeHtml(s.exam_name)}</p>
          <p class="text-sm text-gray-600 dark:text-gray-300">${escapeHtml(yearLabel(s.year))} · Year ${escapeHtml(s.session_year)}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${s.slots.length} course${s.slots.length === 1 ? '' : 's'} · ${escapeHtml(range)}</p>
        </div>
        <span class="text-xs font-bold px-2 py-1 rounded-full ${s.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${s.is_published ? 'Published' : 'Draft'}</span>
      </div>
      <div class="flex flex-wrap gap-2 mt-3">
        <button onclick="exsView('${attrEsc(s.id)}')" class="bg-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg text-sm btn-pop">👁 View</button>
        <button onclick="exsEdit('${attrEsc(s.id)}')" class="bg-amber-100 text-amber-700 hover:bg-amber-500 hover:text-white px-3 py-1.5 rounded-lg text-sm btn-pop">✏️ Edit</button>
        <button onclick="exsTogglePublish('${attrEsc(s.id)}')" class="bg-sky-100 text-sky-700 hover:bg-sky-600 hover:text-white px-3 py-1.5 rounded-lg text-sm btn-pop">${s.is_published ? '⏸ Unpublish' : '📢 Publish'}</button>
        <button onclick="exsPdf('${attrEsc(s.id)}')" class="bg-red-100 text-red-700 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg text-sm btn-pop">📄 PDF</button>
        <button onclick="exsExcel('${attrEsc(s.id)}')" class="bg-green-100 text-green-700 hover:bg-green-600 hover:text-white px-3 py-1.5 rounded-lg text-sm btn-pop">📊 Excel</button>
        <button onclick="exsDelete('${attrEsc(s.id)}')" class="bg-gray-100 text-gray-600 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg text-sm btn-pop">🗑 Delete</button>
      </div></div>`;
  };
  root.innerHTML = `<div class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-lg font-bold dark:text-white">📅 Exam Schedule <span class="text-xs text-gray-400 num-display">(${EXS.list.length})</span></h3>
      <button onclick="exsNew()" class="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold btn-pop">➕ New Schedule</button>
    </div>
    ${EXS.list.length ? EXS.list.map(card).join('') : '<div class="text-center text-gray-400 py-10 border-2 border-dashed rounded-xl">No exam schedules yet. Click “New Schedule”.</div>'}
  </div>`;
}
function exsBackToList() { exsLoadList().then(exsRenderList).catch(e => toastError(e.message || 'Failed to load')); }
function exsFind(id) { return EXS.list.find(s => s.id === id); }

// ---------- shared table / export builders (same shape for admin, teacher, student) ----------
function exsTableHtml(sch, withRooms) {
  const info = (typeof courseInfo === 'function') ? courseInfo : () => ({ name: '' });
  let rows = '';
  sch.slots.forEach(sl => {
    const rooms = withRooms && sl.rooms && sl.rooms.length ? sl.rooms : [null];
    rooms.forEach((r, i) => {
      rows += '<tr class="border-t dark:border-gray-600">';
      if (i === 0) {
        const span = rooms.length;
        rows += `<td rowspan="${span}" class="p-2 align-top whitespace-nowrap font-bold">${escapeHtml(exsFmtDate(sl.date))}<br><span class="font-normal text-xs text-gray-500">${escapeHtml(sl.day || exsDayName(sl.date))}</span></td>`;
        rows += `<td rowspan="${span}" class="p-2 align-top"><b>${escapeHtml(sl.course_code)}</b><br><span class="text-xs text-gray-500">${escapeHtml(info(sl.course_code).name || '')}</span></td>`;
        rows += `<td rowspan="${span}" class="p-2 align-top whitespace-nowrap">${escapeHtml(exsFmt12(sl.start))}<br>${escapeHtml(exsFmt12(sl.end))}</td>`;
      }
      if (withRooms) {
        rows += `<td class="p-2 align-top whitespace-nowrap">${r ? escapeHtml(r.room_no) : '<span class="text-gray-400">—</span>'}</td>`;
        rows += `<td class="p-2 align-top">${r && r.invigilators && r.invigilators.length ? r.invigilators.map(escapeHtml).join('<br>') : '<span class="text-gray-400">—</span>'}</td>`;
      }
      rows += '</tr>';
    });
  });
  return `<div class="overflow-x-auto"><table class="w-full text-sm text-left dark:text-white"><thead><tr class="bg-indigo-50 dark:bg-gray-700 text-xs uppercase"><th class="p-2">Date</th><th class="p-2">Course</th><th class="p-2">Time</th>${withRooms ? '<th class="p-2">Room</th><th class="p-2">Invigilator(s)</th>' : ''}</tr></thead><tbody>${rows || '<tr><td class="p-3 text-gray-400" colspan="5">No entries</td></tr>'}</tbody></table></div>`;
}
function exsExportRows(sch, withRooms) {
  const info = (typeof courseInfo === 'function') ? courseInfo : () => ({ name: '' });
  const out = [];
  sch.slots.forEach(sl => {
    const base = [exsFmtDate(sl.date), sl.day || exsDayName(sl.date), sl.course_code, info(sl.course_code).name || '', `${exsFmt12(sl.start)} - ${exsFmt12(sl.end)}`];
    if (!withRooms) { out.push(base); return; }
    if (!sl.rooms || !sl.rooms.length) { out.push(base.concat(['-', '-'])); return; }
    sl.rooms.forEach(r => out.push(base.concat([r.room_no, (r.invigilators || []).join(', ') || '-'])));
  });
  return out;
}
function exsExportHead(withRooms) { return ['Date', 'Day', 'Course Code', 'Course Name', 'Time'].concat(withRooms ? ['Room', 'Invigilator(s)'] : []); }
function exsFileName(sch, ext) { return `ExamSchedule_${String(sch.exam_name).replace(/[^\w.-]+/g, '_')}_${String(sch.year).replace(/\W+/g, '_')}_${sch.session_year}.${ext}`; }

async function exsPdfFor(sch, withRooms) {
  await getCourseInfoMap();
  await savePdfA4({
    file: exsFileName(sch, 'pdf'), title: `Exam Schedule: ${sch.exam_name}`,
    lines: [`Class: ${yearLabel(sch.year)}`, `Year: ${sch.session_year}`],
    head: [exsExportHead(withRooms)], body: exsExportRows(sch, withRooms), orientation: withRooms ? 'landscape' : 'portrait'
  });
}
async function exsExcelFor(sch, withRooms) {
  await getCourseInfoMap();
  const aoa = [[`Exam Schedule: ${sch.exam_name}`], [`Class: ${yearLabel(sch.year)}`], [`Year: ${sch.session_year}`], [], exsExportHead(withRooms)].concat(exsExportRows(sch, withRooms));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = withRooms ? [{ wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 34 }, { wch: 20 }, { wch: 10 }, { wch: 40 }] : [{ wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 34 }, { wch: 20 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Exam Schedule');
  XLSX.writeFile(wb, exsFileName(sch, 'xlsx'));
}
async function exsPdf(id) { const s = exsFind(id); if (!s) return; showGlobalLoader(); try { await exsPdfFor(s, true); } catch (e) { toastError('PDF failed: ' + (e.message || e)); } finally { hideGlobalLoader(); } }
async function exsExcel(id) { const s = exsFind(id); if (!s) return; showGlobalLoader(); try { await exsExcelFor(s, true); } catch (e) { toastError('Excel failed: ' + (e.message || e)); } finally { hideGlobalLoader(); } }

// ---------- view / publish / delete ----------
async function exsView(id) {
  const s = exsFind(id); if (!s) return;
  await getCourseInfoMap();
  Swal.fire({
    title: escapeHtml(s.exam_name), width: 'min(96vw, 900px)', showConfirmButton: true, confirmButtonText: 'Close', confirmButtonColor: '#4f46e5',
    html: `<div style="text-align:left"><p style="font-size:13px;color:#6b7280;margin-bottom:8px">${escapeHtml(yearLabel(s.year))} · Year ${escapeHtml(s.session_year)} · <b>${s.is_published ? 'Published' : 'Draft'}</b></p>${exsTableHtml(s, true)}</div>`
  });
}
async function exsTogglePublish(id) {
  const s = exsFind(id); if (!s) return;
  if (!s.is_published) {
    const missing = s.slots.filter(sl => !sl.rooms.length || sl.rooms.some(r => !r.invigilators.length)).length;
    const ok = await Swal.fire({ icon: 'question', title: 'Publish this schedule?', showCancelButton: true, confirmButtonText: 'Publish', confirmButtonColor: '#059669', cancelButtonText: 'Cancel',
      html: `<div style="text-align:left;font-size:14px">Students of <b>${escapeHtml(yearLabel(s.year))}</b> (year ${escapeHtml(s.session_year)}) will see the dates, courses and times. Rooms and invigilators are shown only to teachers.${missing ? `<br><br>⚠️ ${missing} entr${missing === 1 ? 'y has' : 'ies have'} no room or invigilator yet.` : ''}</div>` });
    if (!ok.isConfirmed) return;
  }
  showGlobalLoader();
  try {
    const { error } = await db.rpc('admin_publish_exam_schedule', { p_id: id, p_publish: !s.is_published });
    if (error) throw error;
    toastSuccess(s.is_published ? 'Unpublished' : 'Published');
    await exsLoadList(); exsRenderList();
  } catch (e) { toastError(exsFriendly(e)); } finally { hideGlobalLoader(); }
}
async function exsDelete(id) {
  const s = exsFind(id); if (!s) return;
  const ok = await Swal.fire({ icon: 'warning', title: 'Delete this schedule?', showCancelButton: true, confirmButtonText: 'Yes, delete', confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280', reverseButtons: true,
    html: `<div style="text-align:left;font-size:14px"><b>${escapeHtml(s.exam_name)}</b> · ${escapeHtml(yearLabel(s.year))} · ${escapeHtml(s.session_year)}<br>All its dates, rooms and invigilators will be deleted. Attendance and marks are not affected.</div>` });
  if (!ok.isConfirmed) return;
  showGlobalLoader();
  try {
    const { error } = await db.from('exam_schedules').delete().eq('id', id);
    if (error) throw error;
    toastSuccess('Deleted');
    await exsLoadList(); exsRenderList();
  } catch (e) { toastError(exsFriendly(e)); } finally { hideGlobalLoader(); }
}
function exsFriendly(e) {
  const m = (e && e.message) || String(e || 'Failed');
  if (/exam_schedules_session_year_year_exam_type_id_key|exam_schedules.*duplicate/i.test(m)) return 'A schedule for this class, session and exam already exists. Edit that one instead.';
  if (/exam_slots_schedule_id_exam_date_course_code_key/i.test(m)) return 'The same course is added twice on the same date.';
  if (/exam_rooms_slot_room_key/i.test(m)) return 'The same room is added twice in one entry.';
  if (/not an active teacher/i.test(m)) return 'An invigilator is no longer an active teacher. Please re-select.';
  if (/admin only/i.test(m)) return 'Only the admin can do this. Please login again.';
  return m;
}

// ---------- form: state ----------
function exsNewBlock(prev) {
  const dur = exsDuration();
  const start = prev ? prev.start : '10:00';
  return { uid: exsUid(), date: '', course: '', start, end: prev ? prev.end : exsAddMinutes(start, dur), endManual: prev ? prev.endManual : false, rooms: [exsNewRoom()] };
}
function exsNewRoom() { return { uid: exsUid(), room_no: '', inv: [''] }; }

async function exsNew() {
  EXS.form = { id: null, year: '', session_year: '', exam_type_id: '', blocks: [] };
  const first = EXS.examTypes.find(e => e.is_active);
  EXS.form.exam_type_id = first ? first.id : '';
  EXS.form.blocks.push(exsNewBlock(null));
  exsRenderForm();
  await exsClassChanged();
}
async function exsEdit(id) {
  const s = exsFind(id); if (!s) return;
  showGlobalLoader();
  try {
    EXS.form = { id: s.id, year: s.year, session_year: s.session_year, exam_type_id: s.exam_type_id, blocks: s.slots.map(sl => ({
      uid: exsUid(), date: sl.date, course: sl.course_code, start: sl.start, end: sl.end, endManual: true,
      rooms: sl.rooms.length ? sl.rooms.map(r => ({ uid: exsUid(), room_no: r.room_no, inv: r.teacher_ids.length ? r.teacher_ids.slice() : [''] })) : [exsNewRoom()]
    })) };
    if (!EXS.form.blocks.length) EXS.form.blocks.push(exsNewBlock(null));
    await exsLoadCourses(s.year);
    exsRenderForm();
  } catch (e) { toastError(exsFriendly(e)); } finally { hideGlobalLoader(); }
}

async function exsLoadCourses(yearCode) {
  const cy = exsCatYear(yearCode);
  if (!cy) { EXS.courses = []; return; }
  const { data, error } = await db.from('courses_new').select('course_code, course_name, short_code').eq('category', cy.cat).eq('year_name', cy.yearName).order('course_code');
  if (error) throw error;
  EXS.courses = data || [];
}

async function exsClassChanged() {
  const f = EXS.form; if (!f || f.id) return;
  const yEl = document.getElementById('exsCls'); if (!yEl) return;
  f.year = yEl.value;
  const sSel = document.getElementById('exsSession');
  if (sSel) sSel.innerHTML = '<option value="">Loading...</option>';
  try {
    const [years] = await Promise.all([getAvailableSessionYears(f.year), exsLoadCourses(f.year)]);
    EXS.sessionYears = years;
  } catch (e) { EXS.sessionYears = []; EXS.courses = []; toastError(exsFriendly(e)); }
  if (!f.session_year || !EXS.sessionYears.includes(Number(f.session_year))) f.session_year = EXS.sessionYears.length ? EXS.sessionYears[0] : '';
  f.blocks.forEach(b => { if (b.course && !EXS.courses.some(c => c.course_code === b.course)) b.course = ''; });
  exsRenderSessionSelect();
  exsRenderBlocks();
}
function exsRenderSessionSelect() {
  const f = EXS.form, sSel = document.getElementById('exsSession'); if (!sSel || !f) return;
  sSel.innerHTML = EXS.sessionYears.length
    ? EXS.sessionYears.map(y => `<option value="${attrEsc(y)}"${String(y) === String(f.session_year) ? ' selected' : ''}>${escapeHtml(y)}</option>`).join('')
    : '<option value="">No active students in this class</option>';
}
function exsSetSession(v) { EXS.form.session_year = v; }
function exsSetExam(v) {
  const f = EXS.form; f.exam_type_id = v;
  f.blocks.forEach(b => { if (!b.endManual) b.end = exsAddMinutes(b.start, exsDuration()); });
  exsRenderBlocks();
}
function exsSetDate(bi, v) { const b = EXS.form.blocks[bi]; if (!b) return; b.date = v; const el = document.getElementById('exsDay' + bi); if (el) el.textContent = exsDayName(v) || '—'; }
function exsSetCourse(bi, v) { const b = EXS.form.blocks[bi]; if (b) { b.course = v; exsRenderBlocks(); } }
function exsSetRoom(bi, ri, v) { const r = EXS.form.blocks[bi] && EXS.form.blocks[bi].rooms[ri]; if (r) r.room_no = v; }
function exsSetInv(bi, ri, ii, v) { const r = EXS.form.blocks[bi].rooms[ri]; r.inv[ii] = v; exsRenderBlocks(); }
function exsAddInv(bi, ri) { EXS.form.blocks[bi].rooms[ri].inv.push(''); exsRenderBlocks(); }
function exsRemoveInv(bi, ri, ii) { const r = EXS.form.blocks[bi].rooms[ri]; r.inv.splice(ii, 1); if (!r.inv.length) r.inv.push(''); exsRenderBlocks(); }
function exsAddRoom(bi) { EXS.form.blocks[bi].rooms.push(exsNewRoom()); exsRenderBlocks(); }
function exsRemoveRoom(bi, ri) { const b = EXS.form.blocks[bi]; b.rooms.splice(ri, 1); if (!b.rooms.length) b.rooms.push(exsNewRoom()); exsRenderBlocks(); }
function exsAddBlock() { const f = EXS.form; f.blocks.push(exsNewBlock(f.blocks[f.blocks.length - 1])); exsRenderBlocks(); }
function exsRemoveBlock(bi) { const f = EXS.form; if (f.blocks.length > 1) { f.blocks.splice(bi, 1); exsRenderBlocks(); } }
function exsTime(bi, which, part, dir) {
  const b = EXS.form.blocks[bi]; if (!b) return;
  let { h, m, ap } = exsTo12(b[which] || '10:00');
  if (part === 'h') h = ((h - 1 + dir + 12) % 12) + 1;
  else if (part === 'm') m = dir > 0 ? (Math.floor(m / 5) * 5 + 5) % 60 : (Math.ceil(m / 5) * 5 - 5 + 60) % 60;
  else ap = ap === 'AM' ? 'PM' : 'AM';
  b[which] = exsFrom12(h, m, ap);
  if (which === 'start' && !b.endManual) b.end = exsAddMinutes(b.start, exsDuration());
  if (which === 'end') b.endManual = true;
  exsRenderBlocks();
}

// ---------- form: rendering ----------
function exsTimeHtml(bi, which, val) {
  const t = exsTo12(val || '10:00');
  const ab = 'w-10 h-7 rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white text-xs font-bold btn-pop';
  const col = (part, label) => `<div class="flex flex-col items-center gap-1"><button type="button" onclick="exsTime(${bi},'${which}','${part}',1)" class="${ab}">▲</button><div class="w-10 text-center font-bold text-lg dark:text-white num-display">${label}</div><button type="button" onclick="exsTime(${bi},'${which}','${part}',-1)" class="${ab}">▼</button></div>`;
  return `<div class="flex items-center gap-1 justify-center">${col('h', String(t.h))}<span class="font-bold dark:text-white pb-1">:</span>${col('m', String(t.m).padStart(2, '0'))}${col('ap', t.ap)}</div>`;
}
function exsTeacherOptions(selected, takenIds) {
  const list = EXS.teachers.filter(t => (t.is_active && !t.is_admin) || t.id === selected);
  return '<option value="">Select invigilator</option>' + list.filter(t => t.id === selected || !takenIds.includes(t.id))
    .map(t => `<option value="${attrEsc(t.id)}"${t.id === selected ? ' selected' : ''}>${escapeHtml(t.name)}${t.is_active ? '' : ' (inactive)'}</option>`).join('');
}
function exsRoomHtml(bi, ri, r) {
  const taken = r.inv.filter(Boolean);
  const invs = r.inv.map((v, ii) => `<div class="flex items-center gap-2 mb-2">
      <select onchange="exsSetInv(${bi},${ri},${ii},this.value)" class="${EXS_IN} !p-2 text-sm">${exsTeacherOptions(v, taken)}</select>
      <button type="button" onclick="exsRemoveInv(${bi},${ri},${ii})" class="text-red-500 text-lg px-2 btn-pop" title="Remove">✕</button></div>`).join('');
  const last = r.inv[r.inv.length - 1];
  return `<div class="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 mb-2">
    <div class="flex items-center gap-2 mb-2">
      <input value="${attrEsc(r.room_no)}" oninput="exsSetRoom(${bi},${ri},this.value)" maxlength="20" placeholder="Room No." class="${EXS_IN} !p-2 text-sm">
      <button type="button" onclick="exsRemoveRoom(${bi},${ri})" class="text-red-500 text-sm px-2 btn-pop" title="Remove room">🗑</button>
    </div>
    ${invs}
    ${last ? `<button type="button" onclick="exsAddInv(${bi},${ri})" class="text-indigo-600 dark:text-indigo-300 text-sm font-bold btn-pop">+ Add Invigilator</button>` : ''}
  </div>`;
}
function exsBlockHtml(b, bi) {
  const f = EXS.form;
  const codes = EXS.courses.map(c => c.course_code);
  const extra = b.course && !codes.includes(b.course) ? [{ course_code: b.course, course_name: (courseInfo(b.course).name || '') }] : [];
  const opts = '<option value="">Select course</option>' + EXS.courses.concat(extra).map(c => `<option value="${attrEsc(c.course_code)}"${c.course_code === b.course ? ' selected' : ''}>${escapeHtml(c.course_code)} - ${escapeHtml(c.course_name || '')}</option>`).join('');
  const dur = exsMin(b.end) - exsMin(b.start);
  return `<div class="border-2 border-indigo-100 dark:border-indigo-900 rounded-xl p-3 mb-3 bg-white dark:bg-gray-800">
    <div class="flex items-center justify-between mb-2">
      <b class="dark:text-white">📅 Date ${bi + 1}</b>
      ${f.blocks.length > 1 ? `<button type="button" onclick="exsRemoveBlock(${bi})" class="text-red-500 text-sm btn-pop">🗑 Remove</button>` : ''}
    </div>
    <label class="text-xs font-bold text-gray-500">Date</label>
    <div class="flex items-center gap-3 mb-2">
      <input type="date" value="${attrEsc(b.date)}" onchange="exsSetDate(${bi},this.value)" class="${EXS_IN}">
      <span id="exsDay${bi}" class="font-bold text-indigo-600 dark:text-indigo-300 whitespace-nowrap">${escapeHtml(exsDayName(b.date) || '—')}</span>
    </div>
    <label class="text-xs font-bold text-gray-500">Course</label>
    <select onchange="exsSetCourse(${bi},this.value)" class="${EXS_IN} mb-1">${opts}</select>
    <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">Course code: <b class="dark:text-white">${escapeHtml(b.course || '—')}</b></p>
    <div class="grid grid-cols-2 gap-3 mb-1">
      <div><label class="text-xs font-bold text-gray-500 block text-center mb-1">Start time</label>${exsTimeHtml(bi, 'start', b.start)}</div>
      <div><label class="text-xs font-bold text-gray-500 block text-center mb-1">End time</label>${exsTimeHtml(bi, 'end', b.end)}</div>
    </div>
    <p class="text-xs text-center mb-3 ${dur > 0 ? 'text-gray-500' : 'text-red-500 font-bold'}">${dur > 0 ? 'Duration: ' + escapeHtml(exsFmtDur(dur)) : 'End time must be after start time'}</p>
    <label class="text-xs font-bold text-gray-500">Rooms &amp; Invigilators</label>
    ${b.rooms.map((r, ri) => exsRoomHtml(bi, ri, r)).join('')}
    <button type="button" onclick="exsAddRoom(${bi})" class="text-teal-600 dark:text-teal-300 text-sm font-bold btn-pop">+ Add Room</button>
  </div>`;
}
function exsRenderBlocks() {
  const box = document.getElementById('exsBlocks'); if (!box || !EXS.form) return;
  box.innerHTML = EXS.form.blocks.map(exsBlockHtml).join('');
}
function exsRenderForm() {
  const root = exsRoot(); if (!root) return;
  const f = EXS.form, edit = !!f.id;
  const ets = EXS.examTypes.filter(e => e.is_active || e.id === f.exam_type_id);
  const examSel = `<select id="exsExam" onchange="exsSetExam(this.value)" class="${EXS_IN} mb-2">${ets.map(e => `<option value="${attrEsc(e.id)}"${e.id === f.exam_type_id ? ' selected' : ''}>${escapeHtml(e.name)}</option>`).join('')}</select>`;
  const head = edit
    ? `<div class="bg-indigo-50 dark:bg-gray-700 rounded-xl p-3 mb-3 text-sm dark:text-white"><b>${escapeHtml(yearLabel(f.year))}</b> · Year <b>${escapeHtml(f.session_year)}</b><p class="text-xs text-gray-500 dark:text-gray-300 mt-1">Class and session cannot be changed. To change them, create a new schedule.</p></div>
       <label class="text-xs font-bold text-gray-500">Exam name</label>${examSel}`
    : `<label class="text-xs font-bold text-gray-500">Class</label>${classPickerHtml('exsCls', { onchange: 'exsClassChanged()' })}
       <label class="text-xs font-bold text-gray-500">Session / Year</label><select id="exsSession" onchange="exsSetSession(this.value)" class="${EXS_IN} mb-2"></select>
       <label class="text-xs font-bold text-gray-500">Exam name</label>${examSel}`;
  root.innerHTML = `<div class="space-y-3 max-w-2xl">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-bold dark:text-white">${edit ? '✏️ Edit Exam Schedule' : '➕ New Exam Schedule'}</h3>
      <button onclick="exsBackToList()" class="text-sm text-gray-500 btn-pop">← Back</button>
    </div>
    <div class="bg-white dark:bg-gray-800 border-2 border-indigo-100 dark:border-indigo-900 rounded-xl p-4">${head}</div>
    <div id="exsBlocks"></div>
    <button type="button" onclick="exsAddBlock()" class="w-full border-2 border-dashed border-indigo-300 text-indigo-600 dark:text-indigo-300 rounded-xl py-3 font-bold btn-pop">+ Add Date</button>
    <div class="flex flex-wrap gap-2 pt-2">
      <button onclick="exsSave(false)" class="flex-1 bg-indigo-600 text-white px-4 py-3 rounded-xl font-bold btn-pop">💾 Save${edit ? '' : ' (Draft)'}</button>
      ${!edit || !(exsFind(f.id) || {}).is_published ? '<button onclick="exsSave(true)" class="flex-1 bg-emerald-600 text-white px-4 py-3 rounded-xl font-bold btn-pop">✅ Save &amp; Publish</button>' : ''}
    </div></div>`;
  if (!edit) { const y = document.getElementById('exsCls'); if (y) EXS.form.year = y.value; }
  exsRenderBlocks();
  if (!edit) exsRenderSessionSelect();
}

// ---------- form: validate + save ----------
function exsCollect() {
  const f = EXS.form;
  if (!f.year) return { error: 'Select class and year' };
  if (!f.session_year) return { error: 'No session found: this class has no active students' };
  if (!f.exam_type_id) return { error: 'Select exam name' };
  const slots = []; const seen = new Set(); let warn = false;
  for (let i = 0; i < f.blocks.length; i++) {
    const b = f.blocks[i], n = `Date ${i + 1}`;
    if (!b.date) return { error: `${n}: select a date` };
    if (!b.course) return { error: `${n}: select a course` };
    if (!(exsMin(b.end) > exsMin(b.start))) return { error: `${n}: end time must be after start time` };
    const key = b.date + '|' + b.course;
    if (seen.has(key)) return { error: `${n}: the same course is added twice on this date` };
    seen.add(key);
    const rooms = []; const roomSeen = new Set();
    for (const r of b.rooms) {
      const no = (r.room_no || '').trim().replace(/\s+/g, ' ');
      const ids = [...new Set(r.inv.filter(Boolean))];
      if (!no && !ids.length) continue;
      if (!no) return { error: `${n}: enter the room number for the selected invigilator` };
      if (!EXS_ROOM_RE.test(no)) return { error: `${n}: room "${no}" is invalid (letters, numbers, space, - and / only, max 20)` };
      if (roomSeen.has(no.toLowerCase())) return { error: `${n}: room ${no} is added twice` };
      roomSeen.add(no.toLowerCase());
      if (!ids.length) warn = true;
      rooms.push({ room_no: no, invigilators: ids });
    }
    if (!rooms.length) warn = true;
    slots.push({ exam_date: b.date, course_code: b.course, start_time: b.start, end_time: b.end, rooms });
  }
  return { payload: { id: f.id, session_year: Number(f.session_year), year: f.year, exam_type_id: f.exam_type_id, slots }, warn };
}
async function exsAskConflicts(list) {
  const items = (list || []).map(c => `<li style="margin-bottom:6px">${escapeHtml(c.message)}</li>`).join('');
  const r = await Swal.fire({ icon: 'warning', title: 'Conflicts found', showCancelButton: true, confirmButtonText: 'Save anyway', cancelButtonText: 'Go back and fix', confirmButtonColor: '#d97706', reverseButtons: true,
    html: `<ul style="text-align:left;font-size:14px;padding-left:18px;max-height:50vh;overflow:auto">${items}</ul>` });
  return r.isConfirmed;
}
async function exsSave(publish) {
  const c = exsCollect();
  if (c.error) return toastWarning(c.error);
  if (c.warn) {
    const ok = await Swal.fire({ icon: 'question', title: 'Some entries have no room or invigilator', text: 'You can add them later by editing. Save anyway?', showCancelButton: true, confirmButtonText: 'Save anyway', cancelButtonText: 'Go back', confirmButtonColor: '#4f46e5' });
    if (!ok.isConfirmed) return;
  }
  showGlobalLoader();
  try {
    let res = await db.rpc('admin_save_exam_schedule', { p_payload: c.payload, p_force: false });
    if (res.error) throw res.error;
    let out = res.data;
    if (out && out.ok === false) {
      hideGlobalLoader();
      if (!(await exsAskConflicts(out.conflicts))) return;
      showGlobalLoader();
      res = await db.rpc('admin_save_exam_schedule', { p_payload: c.payload, p_force: true });
      if (res.error) throw res.error;
      out = res.data;
    }
    if (publish) {
      const p = await db.rpc('admin_publish_exam_schedule', { p_id: out.id, p_publish: true });
      if (p.error) throw p.error;
    }
    toastSuccess(publish ? 'Saved and published' : 'Saved');
    await exsLoadList(); exsRenderList();
  } catch (e) { toastError(exsFriendly(e)); } finally { hideGlobalLoader(); }
}

/* ============================================================
   TEACHER PANEL: "Exam Schedule" (all published, exam-wise) and "My Duty" (own invigilation)
   STUDENT DASHBOARD: published schedule of own class, without rooms / invigilators
   ============================================================ */
EXS.t = { schedules: [], duties: [], filter: '' };
EXS.s = { list: [] };

function exsToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function exsRange(sch) {
  const ds = sch.slots.map(x => x.date).sort();
  if (!ds.length) return '';
  return ds[0] === ds[ds.length - 1] ? exsFmtDate(ds[0]) : `${exsFmtDate(ds[0])} → ${exsFmtDate(ds[ds.length - 1])}`;
}
function exsStatus(sch) {
  const ds = sch.slots.map(x => x.date).sort(); const today = exsToday();
  if (!ds.length) return null;
  if (ds[ds.length - 1] < today) return { text: 'Completed', cls: 'bg-gray-100 text-gray-600' };
  if (ds[0] <= today) return { text: 'Ongoing', cls: 'bg-emerald-100 text-emerald-700' };
  return { text: 'Upcoming', cls: 'bg-indigo-100 text-indigo-700' };
}
function exsLoadingHtml() { return '<div class="flex flex-col items-center justify-center py-10 gap-3"><div class="w-9 h-9 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div><p class="text-gray-500 dark:text-gray-400 text-sm">Loading...</p></div>'; }
function exsSchedCard(sch, idx, withRooms, pdfFn, excelFn) {
  const st = exsStatus(sch);
  return `<div class="bg-white dark:bg-gray-800 border-2 border-indigo-100 dark:border-indigo-900 rounded-xl p-3 mb-3">
    <div class="flex flex-wrap items-start justify-between gap-2 mb-2">
      <div class="min-w-0"><p class="font-bold dark:text-white break-words">${escapeHtml(sch.exam_name)}</p>
        <p class="text-sm text-gray-600 dark:text-gray-300">${escapeHtml(yearLabel(sch.year))} · Year ${escapeHtml(sch.session_year)}</p>
        <p class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(exsRange(sch))}</p></div>
      ${st ? `<span class="text-xs font-bold px-2 py-1 rounded-full ${st.cls}">${st.text}</span>` : ''}
    </div>
    ${exsTableHtml(sch, withRooms)}
    <div class="flex gap-2 mt-3">
      <button onclick="${pdfFn}(${idx})" class="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold btn-pop">📄 PDF</button>
      <button onclick="${excelFn}(${idx})" class="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold btn-pop">📊 Excel</button>
    </div></div>`;
}
function exsErrorHtml(msg, retry) {
  return `<div class="text-center py-8"><p class="text-red-500 mb-2">❌ Failed to load</p><p class="text-xs text-gray-400 mb-3">${escapeHtml(msg || '')}</p>${retry ? `<button onclick="${retry}" class="bg-indigo-600 text-white px-4 py-2 rounded-lg btn-pop">Retry</button>` : ''}</div>`;
}

// ---------- teacher ----------
async function exsTeacherTab(el, tab) {
  el.innerHTML = exsLoadingHtml();
  try {
    if (!currentTeacher || !currentTeacher.token) throw new Error('Please login again');
    await getCourseInfoMap();
    if (tab === 'examSchedule') {
      const { data, error } = await db.rpc('t_exam_schedules', { p_token: currentTeacher.token });
      if (error) throw error;
      if (!data || data.ok === false) throw new Error((data && data.message) || 'Failed to load');
      EXS.t.schedules = data.data || [];
      exsTeacherRenderSchedules(el);
    } else {
      const { data, error } = await db.rpc('t_my_exam_duties', { p_token: currentTeacher.token });
      if (error) throw error;
      if (!data || data.ok === false) throw new Error((data && data.message) || 'Failed to load');
      EXS.t.duties = data.data || [];
      exsTeacherRenderDuties(el);
    }
  } catch (e) { el.innerHTML = exsErrorHtml(e.message, `showTeacherTab('${tab}')`); }
}
function exsTeacherRenderSchedules(el) {
  el = el || document.getElementById('teacherContent'); if (!el) return;
  const all = EXS.t.schedules, names = [...new Set(all.map(s => s.exam_name))];
  const flt = names.includes(EXS.t.filter) ? EXS.t.filter : '';
  const rows = all.map((s, i) => ({ s, i })).filter(x => !flt || x.s.exam_name === flt);
  el.innerHTML = `<div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-lg font-bold dark:text-white">📅 Exam Schedule</h3>
      ${names.length > 1 ? `<select onchange="exsTSetFilter(this.value)" class="border-2 rounded-xl p-2 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"><option value="">All exams</option>${names.map(n => `<option value="${attrEsc(n)}"${n === flt ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select>` : ''}
    </div>
    ${rows.length ? rows.map(x => exsSchedCard(x.s, x.i, true, 'exsTPdf', 'exsTExcel')).join('') : '<div class="text-center text-gray-400 py-10 border-2 border-dashed rounded-xl">No exam schedule has been published yet.</div>'}
  </div>`;
}
function exsTSetFilter(v) { EXS.t.filter = v; exsTeacherRenderSchedules(); }
async function exsTPdf(i) { const s = EXS.t.schedules[i]; if (!s) return; showGlobalLoader(); try { await exsPdfFor(s, true); } catch (e) { toastError('PDF failed: ' + (e.message || e)); } finally { hideGlobalLoader(); } }
async function exsTExcel(i) { const s = EXS.t.schedules[i]; if (!s) return; showGlobalLoader(); try { await exsExcelFor(s, true); } catch (e) { toastError('Excel failed: ' + (e.message || e)); } finally { hideGlobalLoader(); } }

function exsDutyHead() { return ['Date', 'Day', 'Course Code', 'Course Name', 'Time', 'Room', 'Exam', 'Class', 'Co-invigilator(s)']; }
function exsDutyRows(list) {
  return list.map(d => [exsFmtDate(d.date), d.day || exsDayName(d.date), d.course_code, courseInfo(d.course_code).name || '', `${exsFmt12(d.start)} - ${exsFmt12(d.end)}`, d.room_no, d.exam_name, `${yearLabel(d.year)} (${d.session_year})`, (d.co_invigilators || []).join(', ') || '-']);
}
function exsTeacherRenderDuties(el) {
  el = el || document.getElementById('teacherContent'); if (!el) return;
  const today = exsToday(), all = EXS.t.duties;
  const upcoming = all.filter(d => d.date >= today), past = all.filter(d => d.date < today).reverse();
  const card = d => `<div class="bg-white dark:bg-gray-800 border-2 ${d.date === today ? 'border-emerald-400' : 'border-indigo-100 dark:border-indigo-900'} rounded-xl p-3 mb-2 ${d.date < today ? 'opacity-60' : ''}">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="font-bold dark:text-white">${escapeHtml(exsFmtDate(d.date))} <span class="font-normal text-sm text-gray-500">${escapeHtml(d.day || exsDayName(d.date))}</span></p>
        ${d.date === today ? '<span class="text-xs font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Today</span>' : ''}
      </div>
      <p class="text-sm dark:text-white mt-1">🕒 ${escapeHtml(exsFmt12(d.start))} - ${escapeHtml(exsFmt12(d.end))} · 🚪 Room <b>${escapeHtml(d.room_no)}</b></p>
      <p class="text-sm dark:text-white"><b>${escapeHtml(d.course_code)}</b> ${escapeHtml(courseInfo(d.course_code).name || '')}</p>
      <p class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(d.exam_name)} · ${escapeHtml(yearLabel(d.year))} · Year ${escapeHtml(d.session_year)}</p>
      ${(d.co_invigilators || []).length ? `<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">With: ${d.co_invigilators.map(escapeHtml).join(', ')}</p>` : ''}
    </div>`;
  el.innerHTML = `<div class="space-y-3 max-w-2xl">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-lg font-bold dark:text-white">📝 My Duty <span class="text-xs text-gray-400 num-display">(${all.length})</span></h3>
      ${all.length ? `<div class="flex gap-2"><button onclick="exsDutyPdf()" class="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold btn-pop">📄 PDF</button><button onclick="exsDutyExcel()" class="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold btn-pop">📊 Excel</button></div>` : ''}
    </div>
    ${all.length ? '' : '<div class="text-center text-gray-400 py-10 border-2 border-dashed rounded-xl">You have no invigilation duty in any published exam schedule.</div>'}
    ${upcoming.length ? `<p class="text-xs font-bold text-gray-500 uppercase">Upcoming</p>${upcoming.map(card).join('')}` : ''}
    ${past.length ? `<p class="text-xs font-bold text-gray-500 uppercase mt-2">Past</p>${past.map(card).join('')}` : ''}
  </div>`;
}
async function exsDutyPdf() {
  showGlobalLoader();
  try { await getCourseInfoMap(); await savePdfA4({ file: 'My_Exam_Duty.pdf', title: 'My Exam Duty', lines: [`Teacher: ${currentTeacher.name || ''}`], head: [exsDutyHead()], body: exsDutyRows(EXS.t.duties), orientation: 'landscape' }); }
  catch (e) { toastError('PDF failed: ' + (e.message || e)); } finally { hideGlobalLoader(); }
}
async function exsDutyExcel() {
  showGlobalLoader();
  try {
    await getCourseInfoMap();
    const aoa = [['My Exam Duty'], [`Teacher: ${currentTeacher.name || ''}`], [], exsDutyHead()].concat(exsDutyRows(EXS.t.duties));
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = [{ wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 20 }, { wch: 22 }, { wch: 36 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'My Duty'); XLSX.writeFile(wb, 'My_Exam_Duty.xlsx');
  } catch (e) { toastError('Excel failed: ' + (e.message || e)); } finally { hideGlobalLoader(); }
}

// ---------- student ----------
async function exsStudentLoad(student) {
  const box = document.getElementById('studentExamBox'); if (!box || !student) return;
  try {
    const { data, error } = await db.rpc('get_student_exam_schedule', { p_year: student.year, p_session_year: Number(student.session_year) });
    if (error) throw error;
    EXS.s.list = (data || []).map(s => ({ ...s, year: student.year, session_year: student.session_year }));
    const today = exsToday();
    const order = x => { const ds = x.slots.map(y => y.date).sort(); return (ds[ds.length - 1] || '') < today ? 1 : 0; };
    EXS.s.list.sort((a, b) => order(a) - order(b));
    box.innerHTML = `<h3 class="font-bold text-lg mb-3 dark:text-white flex items-center gap-2"><span>📅</span> Exam Schedule</h3>
      ${EXS.s.list.length ? EXS.s.list.map((s, i) => exsSchedCard(s, i, false, 'exsSPdf', 'exsSExcel')).join('') : '<p class="text-gray-400 text-sm bg-gray-50 dark:bg-gray-800 p-4 rounded-xl text-center">No exam schedule has been published yet</p>'}
      <div class="mb-6"></div>`;
  } catch (e) { console.warn('Exam schedule load failed', e); box.innerHTML = ''; }
}
async function exsSPdf(i) { const s = EXS.s.list[i]; if (!s) return; showGlobalLoader(); try { await exsPdfFor(s, false); } catch (e) { toastError('PDF failed: ' + (e.message || e)); } finally { hideGlobalLoader(); } }
async function exsSExcel(i) { const s = EXS.s.list[i]; if (!s) return; showGlobalLoader(); try { await exsExcelFor(s, false); } catch (e) { toastError('Excel failed: ' + (e.message || e)); } finally { hideGlobalLoader(); } }
