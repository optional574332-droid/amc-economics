/* js/seminar.js — Seminar (সেমিনার বই) মডিউল
   এই ফাইলে এখন: Admin ট্যাব (বইয়ের তালিকা, Excel আপলোড, টেমপ্লেট, তথ্য সংশোধন)।
   Teacher (Issue/Return/Overdue) ও Student (আবেদন) অংশ পরের ধাপে যোগ হবে।
   বিদ্যমান কোনো টেবিল বা ফাংশন এই ফাইল পরিবর্তন করে না। */

const SMN_STATUS = {
  available: { bn: 'আছে', cls: 'bg-emerald-100 text-emerald-700' },
  issued: { bn: 'ইস্যু করা', cls: 'bg-blue-100 text-blue-700' },
  damaged: { bn: 'ক্ষতিগ্রস্ত', cls: 'bg-amber-100 text-amber-700' },
  lost: { bn: 'হারানো', cls: 'bg-red-100 text-red-700' },
  withdrawn: { bn: 'বাতিল', cls: 'bg-gray-200 text-gray-700' }
};
const SMN_CHUNK = 300;
let smnBooks = [];
let smnSummary = null;
let smnPending = null;   // আপলোডের আগে দেখানো প্রিভিউ

// Admin ইমেইল/পাসওয়ার্ডে লগইন করে (টোকেন নেই) → null; শিক্ষকের জন্য বিদ্যমান টোকেন
function smnToken() {
  return (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.token) ? currentTeacher.token : null;
}

async function smnRpc(fn, args) {
  const { data, error } = await db.rpc(fn, Object.assign({ p_token: smnToken() }, args || {}));
  if (error) throw new Error(error.message || 'সংযোগে সমস্যা');
  if (data && data.ok === false) throw new Error(data.message || 'কাজটি করা যায়নি');
  return data;
}

function smnNormNo(v) {
  return banglaToEnglish(String(v == null ? '' : v)).replace(/\s+/g, '').toUpperCase();
}

// ============================================================
// Admin ট্যাব
// ============================================================
async function smnAdminOpen(el) {
  el.innerHTML = '<div id="smnRoot"><div class="text-center py-8 text-gray-500">⏳ Loading...</div></div>';
  try {
    await smnReload();
    if (currentAdminTab !== 'seminar') return;
    smnRenderAdmin();
  } catch (e) {
    const root = document.getElementById('smnRoot');
    if (root) root.innerHTML = `<div class="text-center py-8"><p class="text-red-500 mb-2">❌ লোড করা যায়নি</p><p class="text-xs text-gray-400 mb-3">${escapeHtml(e.message || '')}</p><button onclick="showAdminTab('seminar')" class="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold">আবার চেষ্টা করুন</button></div>`;
  }
}

async function smnReload() {
  const [sum, list] = await Promise.all([smnRpc('sem_stock_summary'), smnRpc('sem_books')]);
  smnSummary = sum.summary || {};
  smnBooks = list.items || [];
}

function smnCard(label, value, cls) {
  return `<div class="rounded-xl p-3 text-center ${cls}"><div class="text-2xl font-extrabold">${value ?? 0}</div><div class="text-xs font-semibold mt-0.5">${label}</div></div>`;
}

function smnRenderAdmin() {
  const root = document.getElementById('smnRoot');
  if (!root) return;
  const s = smnSummary || {};
  root.innerHTML = `
    <div class="space-y-5">
      <div class="flex justify-between items-center flex-wrap gap-2">
        <h3 class="text-xl font-bold dark:text-white">📚 Seminar বই ব্যবস্থাপনা</h3>
        <button onclick="showAdminTab('seminar')" class="bg-gray-100 dark:bg-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg text-sm font-semibold">🔄 রিফ্রেশ</button>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${smnCard('মোট বই', s.total, 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300')}
        ${smnCard('স্টকে আছে', s.available, 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300')}
        ${smnCard('শিক্ষার্থীর কাছে', s.issued, 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300')}
        ${smnCard('ফেরতের সময় পার', s.overdue, 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300')}
        ${smnCard('ক্ষতিগ্রস্ত', s.damaged, 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}
        ${smnCard('হারানো', s.lost, 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300')}
        ${smnCard('নাম বসানো বাকি', s.without_title, 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200')}
        ${smnCard('আবেদন অপেক্ষায়', s.pending_requests, 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300')}
      </div>

      <div class="bg-teal-50 dark:bg-teal-900/30 p-4 rounded-xl">
        <h4 class="font-bold dark:text-white mb-1">📤 Excel থেকে বই আপলোড</h4>
        <p class="text-xs text-gray-600 dark:text-gray-300 mb-3">
          শুধু <b>book_no (বইয়ের নম্বর)</b> বাধ্যতামূলক। নাম, লেখক, ক্যাটাগরি পরে বসানো যাবে।
          একই নম্বর আবার আপলোড করলে নতুন বই যোগ হবে না; শুধু ফাঁকা নয় এমন নাম/লেখক/ক্যাটাগরি হালনাগাদ হবে এবং বইয়ের অবস্থা অপরিবর্তিত থাকবে।
        </p>
        <div class="flex flex-wrap gap-2 mb-3">
          <button onclick="smnDownloadTemplate()" class="bg-teal-600 text-white px-3 py-2 rounded-lg text-sm font-bold btn-pop">📥 টেমপ্লেট ডাউনলোড</button>
          <button onclick="smnExportCurrent()" class="bg-sky-600 text-white px-3 py-2 rounded-lg text-sm font-bold btn-pop">📋 বর্তমান তালিকা Excel-এ নামান</button>
        </div>
        <input id="smnFile" type="file" accept=".xlsx,.xls,.csv" onchange="smnOnFile(this)" class="block w-full text-sm border-2 border-dashed border-teal-300 dark:border-teal-700 rounded-xl p-3 bg-white dark:bg-gray-800 dark:text-gray-200">
        <div id="smnPreview" class="mt-3"></div>
      </div>

      <div>
        <div class="flex flex-wrap gap-2 mb-3">
          <input id="smnSearch" oninput="smnRenderList()" placeholder="বইয়ের নম্বর, নাম, লেখক বা ক্যাটাগরি দিয়ে খুঁজুন..." class="flex-1 min-w-[200px] border-2 rounded-xl p-2.5 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600">
          <select id="smnFilter" onchange="smnRenderList()" class="border-2 rounded-xl p-2.5 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600">
            <option value="">সব অবস্থা</option>
            <option value="noname">নাম নেই</option>
            ${Object.keys(SMN_STATUS).map(k => `<option value="${k}">${SMN_STATUS[k].bn}</option>`).join('')}
          </select>
        </div>
        <div id="smnList" class="overflow-x-auto"></div>
      </div>
    </div>`;
  smnRenderList();
}

function smnRenderList() {
  const box = document.getElementById('smnList');
  if (!box) return;
  const q = banglaToEnglish((document.getElementById('smnSearch')?.value || '')).trim().toLowerCase();
  const f = document.getElementById('smnFilter')?.value || '';
  let rows = smnBooks.filter(b => {
    if (f === 'noname' && b.title) return false;
    if (f && f !== 'noname' && b.status !== f) return false;
    if (!q) return true;
    return [b.book_no, b.title, b.author, b.category].some(x => String(x || '').toLowerCase().includes(q));
  });
  const total = rows.length;
  rows = rows.slice(0, 200);
  if (!total) { box.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">কোনো বই পাওয়া যায়নি</p>'; return; }
  box.innerHTML = `
    <table class="w-full text-sm">
      <thead><tr class="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-600">
        <th class="py-2 pr-2">নম্বর</th><th class="pr-2">নাম</th><th class="pr-2">লেখক</th><th class="pr-2">ক্যাটাগরি</th><th class="pr-2">অবস্থা</th><th></th></tr></thead>
      <tbody>
      ${rows.map(b => {
        const st = SMN_STATUS[b.status] || { bn: b.status, cls: 'bg-gray-100 text-gray-600' };
        return `<tr class="border-b dark:border-gray-700 dark:text-gray-200">
          <td class="py-2 pr-2 font-bold num-display">${escapeHtml(b.book_no)}</td>
          <td class="pr-2">${b.title ? escapeHtml(b.title) : '<span class="text-gray-400">— নাম নেই —</span>'}</td>
          <td class="pr-2">${escapeHtml(b.author || '')}</td>
          <td class="pr-2">${escapeHtml(b.category || '')}</td>
          <td class="pr-2"><span class="text-xs px-2 py-1 rounded ${st.cls}">${st.bn}</span></td>
          <td class="whitespace-nowrap">
            <button onclick="smnEditBook('${attrEsc(b.id)}')" class="bg-amber-500 text-white px-2 py-1 rounded text-xs font-bold">✏️ সংশোধন</button>
            <button onclick="smnChangeStatus('${attrEsc(b.id)}')" class="bg-gray-600 text-white px-2 py-1 rounded text-xs font-bold">অবস্থা</button>
          </td></tr>`;
      }).join('')}
      </tbody>
    </table>
    <p class="text-xs text-gray-400 mt-2">${total} টির মধ্যে ${rows.length}টি দেখানো হচ্ছে${total > rows.length ? ' — বাকিগুলো দেখতে সার্চ করুন' : ''}</p>`;
}

// ============================================================
// Excel: টেমপ্লেট, বর্তমান তালিকা এক্সপোর্ট, আপলোড
// ============================================================
function smnDownloadTemplate() {
  if (typeof XLSX === 'undefined') { toastError('Excel লাইব্রেরি লোড হয়নি, পেজ রিফ্রেশ করুন'); return; }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['book_no', 'title', 'author', 'category']]);
  // নম্বর কলাম Text ফরম্যাটে, যাতে 001 লিখলে 1 না হয়ে যায়
  for (let r = 2; r <= 1001; r++) ws['A' + r] = { t: 's', v: '', z: '@' };
  ws['!ref'] = 'A1:D1001';
  ws['!cols'] = [{ wch: 14 }, { wch: 44 }, { wch: 30 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Books');
  const help = XLSX.utils.aoa_to_sheet([
    ['নির্দেশনা'],
    ['১. Books শিটে প্রতিটি বইয়ের জন্য একটি সারি দিন (প্রথম সারির শিরোনাম বদলাবেন না)।'],
    ['২. book_no (বইয়ের নম্বর) বাধ্যতামূলক ও ইউনিক। 001 লিখলে 001-ই থাকবে, 1 থেকে আলাদা ধরা হবে।'],
    ['৩. title (নাম), author (লেখক), category (ক্যাটাগরি) ঐচ্ছিক; শুরুতে ফাঁকা রেখে পরে বসানো যাবে।'],
    ['৪. একসঙ্গে সর্বোচ্চ ১০০০টি সারি দেওয়া যাবে; বেশি হলে একাধিক ফাইল আপলোড করুন।'],
    ['৫. আগে আপলোড করা নম্বর আবার দিলে নতুন বই যোগ হবে না; শুধু ফাঁকা নয় এমন নাম/লেখক/ক্যাটাগরি হালনাগাদ হবে।'],
    ['৬. বইয়ের অবস্থা (আছে/ইস্যু/হারানো) এই ফাইল থেকে বদলায় না।']
  ]);
  help['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, help, 'নির্দেশনা');
  XLSX.writeFile(wb, 'seminar_books_template.xlsx');
}

function smnExportCurrent() {
  if (typeof XLSX === 'undefined') { toastError('Excel লাইব্রেরি লোড হয়নি, পেজ রিফ্রেশ করুন'); return; }
  if (!smnBooks.length) { toastInfo('এখনো কোনো বই নেই'); return; }
  const aoa = [['book_no', 'title', 'author', 'category', 'status (শুধু দেখার জন্য)']]
    .concat(smnBooks.map(b => [b.book_no, b.title || '', b.author || '', b.category || '', (SMN_STATUS[b.status] || {}).bn || b.status]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let r = 2; r <= aoa.length; r++) { ws['A' + r].t = 's'; ws['A' + r].z = '@'; }
  ws['!cols'] = [{ wch: 14 }, { wch: 44 }, { wch: 30 }, { wch: 24 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Books');
  XLSX.writeFile(wb, 'seminar_books_' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

const SMN_HEAD = {
  book_no: ['bookno', 'booknumber', 'no', 'number', 'serial', 'sl', 'বইয়েরনম্বর', 'বইয়েরনাম্বার', 'বইনম্বর', 'নম্বর', 'নাম্বার'],
  title: ['title', 'bookname', 'name', 'বইয়েরনাম', 'বইনাম', 'নাম', 'শিরোনাম'],
  author: ['author', 'writer', 'লেখক'],
  category: ['category', 'subject', 'ক্যাটাগরি', 'বিষয়']
};

function smnHeadKey(h) {
  const k = String(h || '').toLowerCase().replace(/[\s_\-\.\(\)]/g, '');
  for (const key of Object.keys(SMN_HEAD)) if (SMN_HEAD[key].includes(k)) return key;
  return null;
}

async function smnOnFile(input) {
  const f = input.files && input.files[0];
  const box = document.getElementById('smnPreview');
  smnPending = null;
  if (!f || !box) return;
  if (typeof XLSX === 'undefined') { box.innerHTML = '<p class="text-red-500 text-sm">Excel লাইব্রেরি লোড হয়নি, পেজ রিফ্রেশ করুন</p>'; return; }
  box.innerHTML = '<p class="text-sm text-gray-500">ফাইল পড়া হচ্ছে...</p>';
  try {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames.find(n => /book/i.test(n)) || wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: '' });
    const hi = rows.findIndex(r => r.some(c => String(c).trim() !== ''));
    if (hi < 0) throw new Error('ফাইলটি ফাঁকা');
    const map = {};
    rows[hi].forEach((h, i) => { const k = smnHeadKey(h); if (k && !(k in map)) map[k] = i; });
    if (!('book_no' in map)) throw new Error('book_no (বইয়ের নম্বর) কলাম পাওয়া যায়নি। টেমপ্লেট ব্যবহার করুন।');

    const items = [], problems = [], seen = {}; let dup = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r.some(c => String(c).trim() !== '')) continue;
      const get = k => (k in map ? String(r[map[k]] ?? '').trim() : '');
      const no = get('book_no');
      const norm = smnNormNo(no);
      if (!norm) { problems.push(`সারি ${i + 1}: বইয়ের নম্বর ফাঁকা`); continue; }
      if (norm.length > 30) { problems.push(`সারি ${i + 1}: নম্বর ৩০ অক্ষরের বেশি (${no})`); continue; }
      if (seen[norm]) dup++;
      seen[norm] = true;
      items.push({ book_no: no, title: get('title'), author: get('author'), category: get('category') });
    }
    if (!items.length) throw new Error('আপলোডযোগ্য কোনো সারি পাওয়া যায়নি');

    const existing = new Set(smnBooks.map(b => b.book_no));
    const uniq = Object.keys(seen);
    const newCount = uniq.filter(n => !existing.has(n)).length;
    const withName = items.filter(x => x.title).length;
    smnPending = items;
    box.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-xl p-3 text-sm dark:text-gray-200 space-y-1">
        <p>📄 <b>${escapeHtml(f.name)}</b> (শিট: ${escapeHtml(sheetName)})</p>
        <p>মোট সারি: <b>${items.length}</b> · নতুন নম্বর: <b class="text-emerald-600">${newCount}</b> · আগে থেকে আছে: <b>${uniq.length - newCount}</b> · নামসহ: <b>${withName}</b></p>
        ${dup ? `<p class="text-amber-600">⚠️ ফাইলের ভেতরে ${dup}টি নম্বর একাধিকবার আছে; একই নম্বর একটি বই হিসেবে ধরা হবে।</p>` : ''}
        ${problems.length ? `<div class="text-red-600"><p>❌ বাদ যাবে (${problems.length}):</p><ul class="list-disc ml-5 text-xs">${problems.slice(0, 10).map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>` : ''}
        <button id="smnImportBtn" onclick="smnImport()" class="mt-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold btn-pop">✅ ${items.length}টি সারি আপলোড করুন</button>
      </div>`;
  } catch (e) {
    box.innerHTML = `<p class="text-red-500 text-sm font-semibold">❌ ${escapeHtml(e.message || 'ফাইল পড়া যায়নি')}</p>`;
  }
}

async function smnImport() {
  if (!smnPending || !smnPending.length) return;
  const btn = document.getElementById('smnImportBtn');
  const items = smnPending;
  const ok = await confirmAction('বই আপলোড করবেন?', `${items.length}টি সারি বইয়ের তালিকায় যুক্ত/হালনাগাদ হবে।`, 'হ্যাঁ, আপলোড করুন', '#059669');
  if (!ok) return;
  if (btn) { btn.disabled = true; btn.textContent = 'আপলোড হচ্ছে...'; }
  showGlobalLoader();
  const tot = { inserted: 0, updated: 0, skipped: 0 };
  try {
    for (let i = 0; i < items.length; i += SMN_CHUNK) {
      const r = await smnRpc('sem_admin_add_books', { p_books: items.slice(i, i + SMN_CHUNK) });
      tot.inserted += r.inserted || 0; tot.updated += r.updated || 0; tot.skipped += r.skipped || 0;
    }
    smnPending = null;
    const fi = document.getElementById('smnFile'); if (fi) fi.value = '';
    await smnReload();
    smnRenderAdmin();
    Swal.fire({ icon: 'success', title: 'আপলোড সম্পন্ন', html: `নতুন বই: <b>${tot.inserted}</b><br>তথ্য হালনাগাদ: <b>${tot.updated}</b><br>বাদ: <b>${tot.skipped}</b>`, confirmButtonText: 'ঠিক আছে' });
  } catch (e) {
    toastError(e.message || 'আপলোড ব্যর্থ');
    if (btn) { btn.disabled = false; btn.textContent = `✅ ${items.length}টি সারি আপলোড করুন`; }
    // আংশিক আপলোড হয়ে থাকতে পারে; একই ফাইল আবার দিলে নিরাপদ (নতুন নম্বর ডুপ্লিকেট হয় না)
    try { await smnReload(); } catch (_) {}
  } finally {
    hideGlobalLoader();
  }
}

// ============================================================
// বইয়ের তথ্য সংশোধন ও অবস্থা পরিবর্তন (Admin)
// ============================================================
async function smnEditBook(id) {
  const b = smnBooks.find(x => x.id === id);
  if (!b) return;
  const r = await Swal.fire({
    title: 'বই ' + b.book_no,
    html: `<input id="smnEdTitle" class="swal2-input" placeholder="বইয়ের নাম" value="${attrEsc(b.title || '')}">
           <input id="smnEdAuthor" class="swal2-input" placeholder="লেখক" value="${attrEsc(b.author || '')}">
           <input id="smnEdCat" class="swal2-input" placeholder="ক্যাটাগরি" value="${attrEsc(b.category || '')}">`,
    showCancelButton: true, confirmButtonText: 'সংরক্ষণ', cancelButtonText: 'বাতিল', focusConfirm: false,
    preConfirm: () => ({
      title: document.getElementById('smnEdTitle').value,
      author: document.getElementById('smnEdAuthor').value,
      category: document.getElementById('smnEdCat').value
    })
  });
  if (!r.isConfirmed) return;
  showGlobalLoader();
  try {
    await smnRpc('sem_admin_update_book', { p_book_id: id, p_title: r.value.title, p_author: r.value.author, p_category: r.value.category });
    await smnReload(); smnRenderAdmin(); toastSuccess('সংরক্ষিত হয়েছে');
  } catch (e) { toastError(e.message); } finally { hideGlobalLoader(); }
}

async function smnChangeStatus(id) {
  const b = smnBooks.find(x => x.id === id);
  if (!b) return;
  if (b.status === 'issued') { toastWarning('বইটি এখন শিক্ষার্থীর কাছে আছে; আগে ফেরত নিন'); return; }
  const opts = ['available', 'damaged', 'lost', 'withdrawn'].filter(k => k !== b.status);
  const r = await Swal.fire({
    title: 'বই ' + b.book_no + ' — অবস্থা পরিবর্তন',
    html: `<select id="smnStSel" class="swal2-select" style="display:flex">${opts.map(k => `<option value="${k}">${SMN_STATUS[k].bn}</option>`).join('')}</select>
           <input id="smnStNote" class="swal2-input" placeholder="কারণ লিখুন (বাধ্যতামূলক)">`,
    showCancelButton: true, confirmButtonText: 'পরিবর্তন করুন', cancelButtonText: 'বাতিল', focusConfirm: false,
    preConfirm: () => {
      const note = document.getElementById('smnStNote').value.trim();
      if (!note) { Swal.showValidationMessage('কারণ লিখুন'); return false; }
      return { status: document.getElementById('smnStSel').value, note };
    }
  });
  if (!r.isConfirmed) return;
  showGlobalLoader();
  try {
    await smnRpc('sem_admin_set_book_status', { p_book_id: id, p_status: r.value.status, p_note: r.value.note });
    await smnReload(); smnRenderAdmin(); toastSuccess('অবস্থা পরিবর্তন হয়েছে');
  } catch (e) { toastError(e.message); } finally { hideGlobalLoader(); }
}
