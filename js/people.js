/* js/people.js — শিক্ষক ম্যানেজমেন্ট + স্টুডেন্ট ম্যানেজমেন্ট */
// ============================================================
// TEACHER MANAGEMENT
// ============================================================
function openTeacherModal(html) {
  document.getElementById('attendanceModal').classList.remove('hidden');
  document.getElementById('modalContent').innerHTML = html;
}

function showTeacherForm(id = '') {
  const t = id ? (allTeachers.find(x => x.id === id) || {}) : {};
  const isEdit = !!t.id;
  if (id && !isEdit) return toastError('Teacher not found');
  const inp = 'w-full border-2 rounded-xl p-2 dark:bg-gray-700 dark:text-white dark:border-gray-600';

  openTeacherModal(`
    <h3 class="text-xl font-bold mb-4 dark:text-white">${isEdit ? '✏️ Edit Teacher' : '+ Add Teacher'}</h3>
    <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      <input id="tfName" value="${escapeHtml(t.name || '')}" placeholder="Full name *" class="${inp}">
      <div>
        <input id="tfUserId" value="${escapeHtml(t.user_id || '')}" placeholder="User ID * (for login, unique)" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" class="${inp}">
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Teacher logs in with this ID and PIN. No spaces allowed.</p>
      </div>
      <div>
        <div class="relative">
          <input id="tfPin" type="password" inputmode="numeric" autocomplete="new-password" placeholder="${isEdit ? 'New PIN (leave empty to keep)' : 'PIN (4-6 digits) *'}" class="${inp} num-display pr-10">
          <button type="button" onclick="const p=document.getElementById('tfPin'); p.type = p.type==='password'?'text':'password';" class="absolute right-2 top-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm">👁️</button>
        </div>
        ${isEdit ? '<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave empty to keep current PIN</p>' : ''}
      </div>
      <input id="tfNameCode" value="${escapeHtml(t.name_code || '')}" placeholder="Name code" class="${inp}">
      <input id="tfDesignation" value="${escapeHtml(t.designation || '')}" placeholder="Designation" class="${inp}">
      <input id="tfBCS" value="${escapeHtml(t.bcs_batch || '')}" placeholder="BCS batch" class="${inp}">
      <input id="tfMobile" value="${escapeHtml(t.mobile || '')}" placeholder="Mobile number" class="${inp} num-display">
      <input id="tfWhatsapp" value="${escapeHtml(t.whatsapp || '')}" placeholder="WhatsApp number (leave empty to use mobile)" class="${inp} num-display">
      <input id="tfEmail" value="${escapeHtml(t.email || '')}" placeholder="Email" class="${inp}">
      <input id="tfIdNo" value="${escapeHtml(t.id_no || '')}" placeholder="ID No" class="${inp}">
      <input id="tfSubject" value="${escapeHtml(t.subject || '')}" placeholder="Subject (e.g., Economics)" class="${inp}">
      <textarea id="tfBiography" rows="2" placeholder="Biography" class="${inp}">${escapeHtml(t.biography || '')}</textarea>
    </div>
    <div class="flex gap-2 mt-4">
      <button onclick="saveTeacher('${escapeHtml(id)}')" class="flex-1 bg-emerald-600 text-white py-2 rounded font-bold">Save</button>
      <button onclick="closeModal()" class="flex-1 bg-gray-400 text-white py-2 rounded font-bold">Cancel</button>
    </div>
  `);
  document.getElementById('tfName').focus();
}

async function saveTeacher(id) {
  const val = k => (document.getElementById(k)?.value || '').trim();
  const name = val('tfName');
  const pin = banglaToEnglish(val('tfPin'));

  const profile = {
    subject: val('tfSubject') || null,
    name_code: val('tfNameCode') || null,
    designation: val('tfDesignation') || null,
    bcs_batch: val('tfBCS') || null,
    mobile: banglaToEnglish(val('tfMobile')) || null,
    email: val('tfEmail') || null,
    ...((teacherWaCol || val('tfWhatsapp')) ? { whatsapp: banglaToEnglish(val('tfWhatsapp')) || null } : {}),
    id_no: val('tfIdNo') || null,
    user_id: val('tfUserId').toLowerCase() || null,
    biography: val('tfBiography') || null
  };

  if (!name) return toastWarning('Enter teacher name');
  if (!profile.user_id) return toastWarning('Enter User ID (required for login)');
  if (/\s/.test(profile.user_id)) return toastWarning('No spaces allowed in User ID');
  if (!id && pin.length < 4) return toastWarning('Enter at least 4-digit PIN');
  if (id && pin && pin.length < 4) return toastWarning('PIN must be at least 4 digits (or leave empty)');

  const isDup = e => /duplicate|unique/i.test(e?.message || '');
  showGlobalLoader();
  try {
    let q = db.from('teachers').select('id, name').eq('user_id', profile.user_id).limit(1);
    if (id) q = q.neq('id', id);
    const { data: taken, error: chkErr } = await q;
    if (chkErr) throw chkErr;
    if (taken && taken.length) { toastWarning('User ID already used (' + (taken[0].name || '') + ') — choose another'); return; }

    if (id) {
      const slug = name.toLowerCase().replace(/\s+/g, '_');
      const { error } = await db.from('teachers').update({ name, name_slug: slug, ...profile }).eq('id', id);
      if (error) throw error;
      if (pin) {
        const { data, error: pinErr } = await db.rpc('admin_set_teacher_pin', { p_teacher_id: id, p_pin: pin });
        if (pinErr || (data && data.ok === false)) {
          const msg = data?.message || pinErr?.message || '';
          toastWarning('Saved, but PIN not changed: ' + msg);
          closeModal(); showAdminTab('manageTeacher'); return;
        }
      }
    } else {
      const { data, error } = await db.rpc('admin_add_teacher', { p_name: name, p_pin: pin });
      if (error || !data || !data.ok) { toastError(data?.message || error?.message || 'Failed'); return; }

      let newId = data.teacher_id || data.id || null;
      if (!newId) {
        const { data: found } = await db.from('teachers').select('id').eq('name', name).order('created_at', { ascending: false }).limit(1);
        newId = found && found[0] ? found[0].id : null;
      }
      if (newId && Object.values(profile).some(v => v)) {
        const { error: upErr } = await db.from('teachers').update(profile).eq('id', newId);
        if (upErr) {
          toastWarning(isDup(upErr) ? 'Teacher added, but User ID already used — edit to change' : 'Teacher added, but extra data failed: ' + upErr.message);
          closeModal(); showAdminTab('manageTeacher'); return;
        }
      }
    }
    toastSuccess('Teacher saved');
    closeModal();
    showAdminTab('manageTeacher');
  } catch (e) { toastError(isDup(e) ? 'User ID already used' : (e.message || 'Failed')); } finally { hideGlobalLoader(); }
}

function viewTeacherProfile(id) {
  const t = allTeachers.find(x => x.id === id);
  if (!t) return;
  openTeacherModal(`
    <h3 class="text-xl font-bold mb-2 dark:text-white">${escapeHtml(t.name)}</h3>
    <div class="space-y-2 text-sm dark:text-gray-300">
      <p><b>Name Code:</b> ${escapeHtml(t.name_code || '-')}</p>
      <p><b>Designation:</b> ${escapeHtml(t.designation || '-')}</p>
      <p><b>BCS Batch:</b> ${escapeHtml(t.bcs_batch || '-')}</p>
      <p><b>Mobile:</b> <span class="num-display">${escapeHtml(t.mobile || '-')}</span></p>
      <p><b>WhatsApp:</b> <span class="num-display">${escapeHtml(t.whatsapp || '-')}</span></p>
      <p><b>Email:</b> ${escapeHtml(t.email || '-')}</p>
      <p><b>ID:</b> ${escapeHtml(t.id_no || '-')}</p>
      <p><b>User ID:</b> ${escapeHtml(t.user_id || '-')}</p>
      <p><b>Subject:</b> ${escapeHtml(t.subject || '-')}</p>
      <p><b>Biography:</b> ${escapeHtml(t.biography || 'None')}</p>
    </div>
    <button onclick="closeModal()" class="w-full mt-4 bg-gray-600 text-white py-2 rounded font-bold">Close</button>
  `);
}

async function toggleTeacherStatus(id, currentStatus) {
  const ok = await confirmAction('Confirm?', currentStatus ? 'Deactivate this teacher?' : 'Activate this teacher?', 'Yes');
  if (!ok) return;
  showGlobalLoader();
  try {
    const { error } = await db.from('teachers').update({ is_active: !currentStatus }).eq('id', id);
    if (error) throw error;
    toastSuccess('Updated');
    showAdminTab('manageTeacher');
  } catch (e) { toastError(e.message); } finally { hideGlobalLoader(); }
}

// ============================================================
// STUDENT MANAGEMENT
// ============================================================
function showStudentSubTab(subTab) {
  const el = document.getElementById('studentSubContent');

  if (subTab === 'addExcel') {
    el.innerHTML = `
      <div class="space-y-4 max-w-lg">
        <div class="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-xl">
          <h4 class="font-bold text-sm mb-3 dark:text-white">📂 Excel Import</h4>
          <input id="asSessionYear" type="number" placeholder="Session year (YYYY) e.g. 2026" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          ${classPickerHtml('asYear')}
          <input type="file" id="excelFile" accept=".xlsx,.xls" class="w-full text-sm mb-2 dark:text-white">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Excel: <b>Class Roll | Reg No | Name | Session</b> (Session like 2025-26)</p>
          <div class="flex gap-2">
            <button onclick="previewExcel()" class="flex-1 bg-indigo-600 text-white px-4 py-3 rounded-xl font-bold btn-pop">🔍 Preview</button>
            <button onclick="downloadExcelTemplate()" class="bg-gray-500 text-white px-4 py-3 rounded-xl font-bold btn-pop text-xs">📥</button>
          </div>
        </div>
        <div id="excelPreviewArea"></div>
      </div>`;
  }
  else if (subTab === 'addManual') {
    el.innerHTML = `
      <div class="space-y-3 max-w-lg">
        <div class="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-xl">
          <h4 class="font-bold text-sm mb-3 dark:text-white">✍️ Add Manually</h4>
          <input id="msSessionYear" type="number" placeholder="Session year (YYYY) e.g. 2026" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          ${classPickerHtml('msYear')}
          <input id="msSession" placeholder="Session e.g. 2025-26" list="sessionOptions" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          <input id="msRoll" placeholder="Class roll *" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          <input id="msReg" placeholder="Registration no" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          <input id="msName" placeholder="Student name *" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          <input id="msPhone" placeholder="Mobile" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          <input id="msGuardian" placeholder="Guardian name" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          <input id="msGuardianPhone" placeholder="Guardian phone" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          <textarea id="msAddress" placeholder="Address" rows="2" class="w-full border-2 rounded-xl p-3 mb-3 dark:bg-gray-700 dark:text-white dark:border-gray-600"></textarea>
          <button onclick="addStudentManual()" class="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold btn-pop w-full">Save</button>
        </div>
        <div id="manualStatus" class="text-sm"></div>
      </div>`;
  }
  else if (subTab === 'list') {
    el.innerHTML = `
      <div class="space-y-3">
        <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl">
          <div class="flex gap-2 flex-wrap">
            <input id="lstSessionYear" type="number" placeholder="Session year" class="border-2 rounded-xl p-2 text-sm w-32 dark:bg-gray-600 dark:text-white dark:border-gray-500">
            ${classPickerHtml('lstYear', { allCats: true, placeholder: 'All years', cls: 'border-2 rounded-xl p-2 text-sm dark:bg-gray-600 dark:text-white dark:border-gray-500' })}
            <select id="lstStatus" class="border-2 rounded-xl p-2 text-sm dark:bg-gray-600 dark:text-white dark:border-gray-500">
              <option value="active">✅ Active</option><option value="tc">📤 TC</option><option value="inactive">❌ Inactive</option><option value="graduated">🎓 Graduated</option><option value="">All</option>
            </select>
            <input id="lstSearch" placeholder="Name/roll" class="border-2 rounded-xl p-2 text-sm flex-1 dark:bg-gray-600 dark:text-white dark:border-gray-500">
            <button onclick="loadStudentList()" class="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm">Search</button>
          </div>
        </div>
        <div id="studentListArea"></div>
      </div>`;
    loadStudentList();
  }
  else if (subTab === 'promote') {
el.innerHTML = `
<div class="space-y-3 max-w-2xl">
<div class="bg-teal-50 dark:bg-teal-900/30 p-4 rounded-xl">
<h4 class="font-bold text-sm mb-2 dark:text-white">⬆️ Promote a batch to the next class</h4>
<p class="text-xs text-gray-600 dark:text-gray-300 mb-3">All ticked students move up (Irregular students keep their I- roll and Irregular mark). Untick students who will stay back in the same class: they become Irregular with an I- roll. The last class of each course becomes <b>Graduated</b>.</p>
<div class="flex gap-2 flex-wrap">
<input id="proSessionYear" type="number" placeholder="Session year (YYYY)" class="border-2 rounded-xl p-3 flex-1 dark:bg-gray-700 dark:text-white dark:border-gray-600">
<button onclick="loadPromotePreview()" class="bg-teal-600 text-white px-5 py-3 rounded-xl font-bold btn-pop">🔍 Load</button>
</div>
</div>
<div id="promoteArea"></div>
</div>`;
}
else if (subTab === 'bulkUpdate') {
    el.innerHTML = `
      <div class="space-y-4 max-w-lg">
        <div class="bg-orange-50 dark:bg-orange-900/30 p-4 rounded-xl">
          <h4 class="font-bold text-sm mb-3 dark:text-white">🔄 Excel Bulk Update</h4>
          <input id="buSessionYear" type="number" placeholder="Session year (YYYY) e.g. 2026" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          ${classPickerHtml('buYear')}
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Excel: <b>Class Roll | Reg No | Name | Session</b> (empty cells are left unchanged)</p>
          <input type="file" id="bulkFile" accept=".xlsx,.xls" class="w-full text-sm mb-3 dark:text-white">
          <button onclick="bulkUpdateStudents()" class="w-full bg-orange-600 text-white px-6 py-3 rounded-xl font-bold btn-pop">🔄 Update</button>
        </div>
        <div id="bulkStatus" class="text-sm"></div>
      </div>`;
  }
}

function downloadExcelTemplate() {
  const data = [['Class Roll', 'Reg No', 'Name', 'Session'], ['101', '123456', 'John Doe', '2025-26'], ['I-345', '123457', 'Jane Smith', '2024-25']];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  XLSX.writeFile(wb, 'student_template.xlsx');
}

let pendingExcelStudents = null;
let promoteState = null;
async function loadPromotePreview() {
  const syInput = document.getElementById('proSessionYear');
  if (!syInput || !syInput.value) return toastWarning('Enter session year (YYYY)');
  const session_year = parseInt(syInput.value, 10);

  const area = document.getElementById('promoteArea');
  area.innerHTML = '<p class="text-center py-4 dark:text-gray-300">⏳...</p>';
  try {
    const all = await fetchAll((a, b) => db.from('students').select('id, class_roll, name, year, status, is_irregular').eq('session_year', session_year).eq('status', 'active').range(a, b));
    if (!all.length) { area.innerHTML = '<p class="text-center text-gray-400 py-4">No active students in this session year</p>'; return; }
    const years = ALL_YEAR_CODES.filter(y => all.some(s => s.year === y));
    promoteState = { session_year, all, year: years[years.length - 1] };
    area.innerHTML = `<div class="bg-white dark:bg-gray-700 border-2 border-teal-200 dark:border-teal-700 rounded-xl p-4 space-y-3">
      <div><label class="block text-xs font-bold mb-1 dark:text-white">Current class</label>
      <select id="proYear" onchange="renderPromoteList(this.value)" class="w-full border-2 rounded-xl p-2 dark:bg-gray-600 dark:text-white dark:border-gray-500">${years.map(y => `<option value="${attrEsc(y)}"${y === promoteState.year ? ' selected' : ''}>${escapeHtml(yearLabel(y))} (${all.filter(s => s.year === y).length})</option>`).join('')}</select></div>
      <div id="promoteList"></div></div>`;
    renderPromoteList(promoteState.year);
  } catch (e) { area.innerHTML = `<p class="text-red-500 text-center py-3">❌ ${escapeHtml(e.message)}</p>`; }
}
function renderPromoteList(year) {
  const st = promoteState; if (!st) return;
  st.year = year;
  const list = sortStudents(st.all.filter(s => s.year === year));
  const next = nextYearOf(year);
  const isTerminal = !next; // final class (XII, 4th year, Masters Final)

  const reg = list.filter(s => !s.is_irregular), irr = list.filter(s => s.is_irregular);

  document.getElementById('promoteList').innerHTML = `
    <div class="bg-teal-50 dark:bg-teal-900/30 rounded-xl p-3 text-sm dark:text-white mb-2">
      ${isTerminal
        ? `<b>${escapeHtml(yearLabel(year))}</b> is the final class. Checking them will <b>Archive (Graduate)</b> them.`
        : `<b>${escapeHtml(yearLabel(year))}</b> → <b>${escapeHtml(yearLabel(next))}</b>. Uncheck students who will stay back (become irregular).`}
      <br>Regular: <b class="num-display">${reg.length}</b> · Irregular: <b class="num-display">${irr.length}</b>
    </div>
    <div class="max-h-80 overflow-y-auto space-y-1 pr-1">
      ${list.map(s => `
        <label class="flex items-center gap-2 bg-gray-50 dark:bg-gray-600 px-3 py-2 rounded-lg text-sm dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-500 transition">
          <input type="checkbox" class="pro-stay w-5 h-5" value="${attrEsc(s.id)}" checked>
          <span class="num-display ${s.is_irregular ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}">${escapeHtml(s.class_roll)}</span>
          ${escapeHtml(s.name)}
          ${s.is_irregular ? '<span class="chip chip-none ml-auto">Irregular</span>' : ''}
        </label>`).join('')}
    </div>
    <button onclick="runPromote(${isTerminal})" class="mt-4 w-full bg-gradient-to-r ${isTerminal ? 'from-indigo-600 to-purple-600' : 'from-teal-600 to-emerald-600'} text-white py-3 rounded-xl font-bold btn-pop shadow-lg">
      ${isTerminal ? '📦 Archive Selected (Graduate)' : '⬆️ Promote Selected'}
    </button>`;
}
async function runPromote(isArchive = false) {
  const st = promoteState; if (!st) return;

  // unchecked students are the ones who STAY
  const allCheckboxes = [...document.querySelectorAll('.pro-stay')];
  const stayIds = allCheckboxes.filter(c => !c.checked).map(c => c.value);
  const promoteCount = allCheckboxes.filter(c => c.checked).length;

  const next = nextYearOf(st.year);
  const msg = isArchive
    ? `${promoteCount} students will be Archived (Graduated). ${stayIds.length} will stay back as Irregular.`
    : `${promoteCount} students will be promoted to ${yearLabel(next)}. ${stayIds.length} will stay back as Irregular.`;

  const ok = await confirmAction(isArchive ? 'Archive Batch?' : 'Promote Batch?', msg, 'Yes, proceed', '#0d9488');
  if (!ok) return;

  showGlobalLoader();
  try {
    const { data, error } = await db.rpc('admin_promote_students', {
      p_from_year: st.year,
      p_from_session_year: st.session_year,
      p_stay_ids: stayIds,
      p_is_archive: isArchive
    });

    if (error || !data || !data.ok) return toastError((data && data.message) || (error && error.message) || 'Failed');

    toastSuccess(isArchive ? `${data.graduated} students graduated` : `${data.promoted} students promoted`);
    loadPromotePreview();
  } finally { hideGlobalLoader(); }
}
async function previewExcel() {
  const file = document.getElementById('excelFile')?.files[0];
  if (!file) return toastWarning('Select file');
  const area = document.getElementById('excelPreviewArea');
  area.innerHTML = '<p class="text-center py-4 dark:text-gray-300">⏳...</p>';
  const session_year = parseInt(document.getElementById('asSessionYear').value, 10);
  const year = document.getElementById('asYear').value;
  if (!session_year || session_year < 2000 || session_year > 2100) { area.innerHTML = '<p class="text-red-500 text-center">❌ Enter session year (YYYY)</p>'; return; }
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const valid = [], dup = [], inv = [];
      const sR = new Set(), sG = new Set();
      rows.slice(1).forEach((r, i) => {
        const n = i + 2;
        const roll = String(r[0] || '').trim();
        const reg = String(r[1] || '').trim();
        const name = String(r[2] || '').trim();
        const session = String(r[3] || '').trim();
        if (!roll || !name || !session || sessionError(session)) { inv.push({ row: n }); return; }
        if (sR.has(roll)) { dup.push({ row: n, roll }); return; }
        if (reg && sG.has(reg)) { dup.push({ row: n, roll, reg }); return; }
        sR.add(roll); if (reg) sG.add(reg);
        valid.push({ session, session_year, year, class_roll: roll, reg_no: reg || null, name, status: 'active', is_irregular: /^I-/i.test(roll) });
      });
      let ex = [];
      if (valid.length) {
        const { data: existing } = await db.from('students').select('class_roll, reg_no').eq('session_year', session_year).eq('year', year).eq('status', 'active').in('class_roll', valid.map(v => v.class_roll));
        const regs = valid.map(v => v.reg_no).filter(Boolean);
        const { data: regHit } = regs.length ? await db.from('students').select('reg_no').eq('status', 'active').in('reg_no', regs) : { data: [] };
        const sRoll = new Set((existing || []).map(e => e.class_roll)), sReg = new Set((regHit || []).map(e => e.reg_no));
        ex = valid.filter(v => sRoll.has(v.class_roll) || (v.reg_no && sReg.has(v.reg_no)));
      }
      const exSet = new Set(ex);
      const finalV = valid.filter(v => !exSet.has(v));
      pendingExcelStudents = finalV;
      area.innerHTML = `
        <div class="bg-white dark:bg-gray-700 border-2 border-indigo-200 dark:border-indigo-700 rounded-xl p-4 space-y-3">
          <h4 class="font-bold text-sm text-gray-700 dark:text-white">📊 Preview</h4>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="bg-emerald-50 dark:bg-emerald-900/30 p-2 rounded-lg"><p class="text-emerald-700 dark:text-emerald-300 font-bold text-xs">✅ Valid</p><p class="text-2xl font-bold text-emerald-800 dark:text-emerald-200 num-display">${finalV.length}</p></div>
            <div class="bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg"><p class="text-amber-700 dark:text-amber-300 font-bold text-xs">⚠️ Dup</p><p class="text-2xl font-bold text-amber-800 dark:text-amber-200 num-display">${dup.length}</p></div>
            <div class="bg-red-50 dark:bg-red-900/30 p-2 rounded-lg"><p class="text-red-700 dark:text-red-300 font-bold text-xs">❌ Invalid</p><p class="text-2xl font-bold text-red-800 dark:text-red-200 num-display">${inv.length}</p></div>
            <div class="bg-orange-50 dark:bg-orange-900/30 p-2 rounded-lg"><p class="text-orange-700 dark:text-orange-300 font-bold text-xs">🔁 In DB</p><p class="text-2xl font-bold text-orange-800 dark:text-orange-200 num-display">${ex.length}</p></div>
          </div>
          ${finalV.length ? `<button id="confirmExcelImportBtn" class="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold btn-pop">✅ Add <span class="num-display">${finalV.length}</span> students</button>` : '<p class="text-center text-red-500 text-sm">Nothing to import</p>'}
        </div>`;
      const btn = document.getElementById('confirmExcelImportBtn');
      if (btn) btn.addEventListener('click', () => confirmExcelImport(btn));
    } catch (err) { area.innerHTML = `<p class="text-red-500 text-center py-4">❌ ${escapeHtml(err.message)}</p>`; }
  };
  reader.readAsArrayBuffer(file);
}

async function confirmExcelImport(btn) {
  if (!pendingExcelStudents || !pendingExcelStudents.length) return toastWarning('No data');
  btn.disabled = true; btn.textContent = '⏳...';
  const { error } = await db.from('students').insert(pendingExcelStudents);
  if (error) { btn.disabled = false; btn.textContent = 'Retry'; return toastError(error.message); }
  toastSuccess(`${pendingExcelStudents.length} students added`);
  pendingExcelStudents = null;
  document.getElementById('excelPreviewArea').innerHTML = '';
  document.getElementById('excelFile').value = '';
}

async function addStudentManual() {
  const session = document.getElementById('msSession').value.trim();
  const session_year = parseInt(document.getElementById('msSessionYear').value, 10);
  const year = document.getElementById('msYear').value;
  const roll = document.getElementById('msRoll').value.trim();
  const reg = document.getElementById('msReg').value.trim();
  const name = document.getElementById('msName').value.trim();
  const phone = document.getElementById('msPhone').value.trim();
  const guardian = document.getElementById('msGuardian').value.trim();
  const gPhone = document.getElementById('msGuardianPhone').value.trim();
  const address = document.getElementById('msAddress').value.trim();
  const status = document.getElementById('manualStatus');
  if (!session_year || session_year < 2000 || session_year > 2100 || !session || !roll || !name) { status.innerHTML = '<p class="text-red-500">❌ Enter session year, session, roll, name</p>'; return; }
const sErr = sessionError(session); if (sErr) { status.innerHTML = `<p class="text-red-500">❌ ${escapeHtml(sErr)}</p>`; return; }
  const { error } = await db.from('students').insert({
    session, session_year, year, class_roll: roll, reg_no: reg || null, name, phone: phone || null, guardian_name: guardian || null, guardian_phone: gPhone || null, address: address || null, status: 'active', is_irregular: /^I-/i.test(roll)
});
  if (error) {
    if (error.message.includes('students_active_reg_idx')) status.innerHTML = '<p class="text-amber-600">⚠️ Registration no belongs to another active student</p>';
    else if (error.message.includes('duplicate')) status.innerHTML = '<p class="text-amber-600">⚠️ Roll already exists</p>';
    else status.innerHTML = `<p class="text-red-500">❌ ${escapeHtml(error.message)}</p>`;
    return;
  }
  status.innerHTML = '<p class="text-emerald-600 font-bold">✅ Added</p>';
  ['msRoll','msReg','msName','msPhone','msGuardian','msGuardianPhone','msAddress'].forEach(id => document.getElementById(id).value = '');
  toastSuccess('Student added');
}

async function bulkUpdateStudents() {
  const file = document.getElementById('bulkFile')?.files[0];
  if (!file) return toastWarning('Select file');
  const status = document.getElementById('bulkStatus');
  const session_year = parseInt(document.getElementById('buSessionYear').value, 10);
  const year = document.getElementById('buYear').value;
  if (!session_year) { status.innerHTML = '<p class="text-red-500">❌ Enter session year (YYYY)</p>'; return; }
status.innerHTML = '<p class="text-gray-500">⏳...</p>';
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const updates = rows.slice(1).map(r => ({ class_roll: String(r[0] || '').trim(), reg_no: String(r[1] || '').trim(), name: String(r[2] || '').trim(), session: String(r[3] || '').trim() })).filter(u => u.class_roll);
      if (!updates.length) { status.innerHTML = '<p class="text-red-500">❌ No data</p>'; return; }
      const { data, error } = await db.rpc('bulk_update_students', { p_session_year: session_year, p_year: year, p_updates: updates });
      if (error) { status.innerHTML = `<p class="text-red-500">❌ ${escapeHtml(error.message)}</p>`; return; }
      status.innerHTML = `<div class="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-xl"><p class="font-bold text-emerald-700 dark:text-emerald-300 mb-2">✅ Done</p><p class="text-sm dark:text-white">✓ Updated: <span class="num-display">${data.updated}</span></p><p class="text-sm dark:text-white">✗ Not found: <span class="num-display">${data.not_found}</span></p>${data.conflicts ? `<p class="text-sm text-amber-700 dark:text-amber-300">⚠ Reg no already used: <span class="num-display">${escapeHtml((data.conflict_list || []).join(', '))}</span></p>` : ''}</div>`;
    } catch (err) { status.innerHTML = `<p class="text-red-500">❌ ${escapeHtml(err.message)}</p>`; }
  };
  reader.readAsArrayBuffer(file);
}

async function loadStudentList() {
  const lsy = parseInt(document.getElementById('lstSessionYear')?.value, 10);
  const year = document.getElementById('lstYear')?.value;
  const status = document.getElementById('lstStatus')?.value;
  const search = document.getElementById('lstSearch')?.value.trim().toLowerCase();
  let q = db.from('students').select('id, session, session_year, year, class_roll, reg_no, name, status, phone, is_irregular');
  if (lsy) q = q.eq('session_year', lsy);
  if (year) q = q.eq('year', year);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) { document.getElementById('studentListArea').innerHTML = `<p class="text-red-500">❌ ${error.message}</p>`; return; }
  let students = sortStudents(data || []);
  if (search) students = students.filter(s => (s.name && s.name.toLowerCase().includes(search)) || (s.class_roll && s.class_roll.toLowerCase().includes(search)) || (s.reg_no && s.reg_no.toLowerCase().includes(search)));
  if (!students.length) { document.getElementById('studentListArea').innerHTML = `<p class="text-gray-400 text-sm text-center py-8">Nothing found</p>`; return; }
  const icons = { active: '✅', tc: '📤', inactive: '❌', graduated: '🎓', suspended: '⛔' };
  const area = document.getElementById('studentListArea');
  area.innerHTML = `
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">Total: <span class="num-display">${students.length}</span></p>
    <div class="overflow-y-auto max-h-[500px] space-y-2">
      ${students.map(s => `
        <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl flex justify-between items-center gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2"><span>${icons[s.status] || '✅'}</span><b class="text-sm dark:text-white">${escapeHtml(s.name)}</b>${s.is_irregular ? ' <span class="chip chip-none">Irregular</span>' : ''}</div>
            <p class="text-xs text-gray-500 dark:text-gray-400 truncate">Roll: <span class="num-display">${escapeHtml(s.class_roll)}</span> · Reg: <span class="num-display">${escapeHtml(s.reg_no || '-')}</span> · <span class="text-indigo-600 dark:text-indigo-400 font-bold">${escapeHtml(s.session)}${s.session_year ? ` (${escapeHtml(s.session_year)})` : ''}</span> · ${escapeHtml(yearLabel(s.year))}</p>
          </div>
          <button class="student-action-btn bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg text-xs" data-id="${escapeHtml(s.id)}">⚙️</button>
        </div>`).join('')}
    </div>`;
  area.querySelectorAll('.student-action-btn').forEach(b => b.addEventListener('click', () => showStudentActions(b.dataset.id)));
}

async function showStudentActions(id) {
  const { data: stu, error } = await db.from('students').select('*').eq('id', id).single();
  if (error || !stu) return toastError('Student not found');
  document.getElementById('attendanceModal').classList.remove('hidden');
  const c = document.getElementById('modalContent');
  c.innerHTML = `
    <h3 class="text-lg font-bold text-gray-800 dark:text-white mb-3">${escapeHtml(stu.name)}</h3>
    <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">Roll: <span class="num-display">${escapeHtml(stu.class_roll)}</span> · Reg: <span class="num-display">${escapeHtml(stu.reg_no || '-')}</span></p>
    <div class="grid grid-cols-2 gap-2 mb-4">
      <button class="action-edit bg-blue-500 text-white py-2.5 rounded-lg text-sm font-bold btn-pop">✏️ Edit</button>
      <button class="action-status bg-amber-500 text-white py-2.5 rounded-lg text-sm font-bold btn-pop" data-status="tc">📤 TC</button>
      <button class="action-status bg-gray-500 text-white py-2.5 rounded-lg text-sm font-bold btn-pop" data-status="inactive">❌ Inactive</button>
      <button class="action-status bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-bold btn-pop" data-status="graduated">🎓 Graduated</button>
      <button class="action-status bg-blue-500 text-white py-2.5 rounded-lg text-sm font-bold btn-pop col-span-2" data-status="active">✅ Reactivate</button>
    </div>
    <hr class="my-3 dark:border-gray-600">
    <button class="action-delete w-full bg-red-600 text-white py-3 rounded-xl font-bold btn-pop">🗑️ Delete</button>
    <button onclick="closeModal()" class="w-full mt-2 text-gray-500 dark:text-gray-400 py-2 text-sm">Cancel</button>
  `;
  c.querySelector('.action-edit').addEventListener('click', () => editStudent(stu));
  c.querySelectorAll('.action-status').forEach(b => b.addEventListener('click', () => changeStudentStatus(id, b.dataset.status)));
  c.querySelector('.action-delete').addEventListener('click', () => deleteStudentPermanently(id, stu.name));
}

function editStudent(stu) {
  document.getElementById('attendanceModal').classList.remove('hidden');
  document.getElementById('modalContent').innerHTML = `
    <h3 class="text-lg font-bold text-gray-800 dark:text-white mb-3">✏️ Edit Student</h3>
    <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Class Roll *</label>
    <input id="edRoll" value="${escapeHtml(stu.class_roll)}" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
    <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Reg No</label>
    <input id="edReg" value="${escapeHtml(stu.reg_no || '')}" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
    <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Name *</label>
    <input id="edName" value="${escapeHtml(stu.name)}" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
    <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Mobile</label>
    <input id="edPhone" value="${escapeHtml(stu.phone || '')}" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
    <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Guardian</label>
    <input id="edGuardian" value="${escapeHtml(stu.guardian_name || '')}" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
    <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Guardian Phone</label>
    <input id="edGuardianPhone" value="${escapeHtml(stu.guardian_phone || '')}" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
    <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Class (year)</label>
${classPickerHtml('edYear', { sel: stu.year })}
<label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Session year</label>
<input id="edSessionYear" type="number" value="${escapeHtml(stu.session_year || '')}" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
<label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Session</label>
<input id="edSession" value="${escapeHtml(stu.session || '')}" placeholder="e.g. 2025-26" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
<label class="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2"><input type="checkbox" id="edIrregular" ${stu.is_irregular ? 'checked' : ''}> Irregular student (stays in this class)</label>
<label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Address</label>
<textarea id="edAddress" rows="2" class="w-full border-2 rounded-xl p-3 mb-3 dark:bg-gray-700 dark:text-white dark:border-gray-600">${escapeHtml(stu.address || '')}</textarea>
    <div id="editStudentStatus" class="text-sm mb-3"></div>
    <button id="saveStudentEditBtn" class="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold btn-pop">💾 Save</button>
    <button onclick="closeModal()" class="w-full mt-2 text-gray-500 dark:text-gray-400 py-2 text-sm">Cancel</button>
  `;
  document.getElementById('saveStudentEditBtn').addEventListener('click', async () => {
    const roll = document.getElementById('edRoll').value.trim();
    const reg = document.getElementById('edReg').value.trim();
    const name = document.getElementById('edName').value.trim();
    const phone = document.getElementById('edPhone').value.trim();
    const guardian = document.getElementById('edGuardian').value.trim();
    const gPhone = document.getElementById('edGuardianPhone').value.trim();
    const address = document.getElementById('edAddress').value.trim();
    const st = document.getElementById('editStudentStatus');
    const edSY = parseInt(document.getElementById('edSessionYear').value, 10), edSes = document.getElementById('edSession').value.trim();
    if (!roll || !name) { st.innerHTML = '<p class="text-red-500">❌ Enter roll and name</p>'; return; }
    if (!edSY || !edSes) { st.innerHTML = '<p class="text-red-500">❌ Enter session year and session</p>'; return; }
    const edSErr = sessionError(edSes); if (edSErr) { st.innerHTML = `<p class="text-red-500">❌ ${escapeHtml(edSErr)}</p>`; return; }
    st.innerHTML = '<p class="text-gray-500">⏳...</p>';
    const { error } = await db.from('students').update({ class_roll: roll, reg_no: reg || null, name, phone: phone || null, guardian_name: guardian || null, guardian_phone: gPhone || null, address: address || null, year: document.getElementById('edYear')?.value || stu.year, session_year: edSY, session: edSes, is_irregular: !!document.getElementById('edIrregular')?.checked }).eq('id', stu.id);
    if (error) {
      if (error.message.includes('students_active_reg_idx')) st.innerHTML = '<p class="text-red-500">❌ Registration no belongs to another student</p>';
      else if (error.message.includes('duplicate')) st.innerHTML = '<p class="text-red-500">❌ Roll belongs to another student</p>';
      else st.innerHTML = `<p class="text-red-500">❌ ${escapeHtml(error.message)}</p>`;
      return;
    }
    closeModal();
    toastSuccess('Updated');
    loadStudentList();
  });
}

async function changeStudentStatus(id, ns) {
  const l = { active: 'Active', tc: 'TC', inactive: 'Inactive', graduated: 'Graduated' };
  const ok = await confirmAction('Confirm?', `Mark as "${l[ns]}"?`, 'Yes', '#3b82f6');
  if (!ok) return;
  const u = { status: ns };
  if (ns === 'tc') u.tc_date = new Date().toISOString().split('T')[0];
  const { error } = await db.from('students').update(u).eq('id', id);
  if (error) return toastError(error.message);
  closeModal();
  toastSuccess(`Marked as ${l[ns]}`);
  loadStudentList();
}

async function deleteStudentPermanently(id, name) {
  const ok1 = await confirmAction('Delete?', `⚠️ "${name}"?`, 'Yes, delete', '#dc2626');
  if (!ok1) return;
  const ok2 = await confirmAction('Confirm?', 'Final chance.', 'Yes', '#dc2626');
  if (!ok2) return;
  showGlobalLoader();
  try {
    const { error } = await db.from('students').delete().eq('id', id);
    if (error) return toastError(error.message);
    closeModal();
    toastSuccess('Deleted');
    loadStudentList();
  } finally { hideGlobalLoader(); }
}
