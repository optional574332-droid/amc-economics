/* js/seminar.js — Seminar Library module (all UI text in English)
 * Self-contained. Uses ONLY the existing sem_* database functions — no database change.
 * Roles: Admin (full control) · Seminar staff teachers (issue/return/reports) · Students (request/view).
 * Set SEM_ENABLED = false to switch the whole module off without touching anything else.
 */
(function () {
  'use strict';
  const SEM_ENABLED = true;
  if (!SEM_ENABLED) return;

  // ============================================================
  // STATE + SMALL HELPERS
  // ============================================================
  const S = { role: null, active: false, tab: 'overview', books: null, settings: null,
              found: {}, sel: null, issued: null, pending: null, rep: null, bookPage: 0,
              addRows: 5, upload: null, repKind: 'stock' };
  const $ = id => document.getElementById(id);
  const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const isUuid = v => /^[0-9a-f-]{36}$/i.test(String(v || ''));
  const INP = 'w-full border-2 rounded-xl p-2 dark:bg-gray-700 dark:text-white dark:border-gray-600';
  const BTN = 'px-4 py-2 rounded-lg font-bold btn-pop text-white';
  const CARD = 'bg-gray-50 dark:bg-gray-700 rounded-xl p-3';

  function tok() { return S.role === 'admin' ? null : ((typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.token) || null); }
  function alive(tab) { return S.active && $('semBody') && (!tab || S.tab === tab); }

  // ---------- English text for messages that the database sends in Bengali ----------
  const MSG = {
    'লগইনের মেয়াদ শেষ, আবার লগইন করুন': 'Session expired. Please log in again.',
    'বই ইস্যুর অনুমতি আপনার নেই': 'You do not have permission to issue books.',
    'এই নম্বরের বই পাওয়া যায়নি': 'No book found with this number.',
    'শিক্ষার্থী পাওয়া যায়নি বা সক্রিয় নয়': 'Student not found or not active.',
    'বইটি পাওয়া যায়নি': 'Book not found.',
    'ফেরতের তারিখ আজকের আগে হতে পারে না': 'Due date cannot be before today.',
    'আবেদনটি আর বৈধ নেই (ইতোমধ্যে নিষ্পন্ন বা বাতিল)': 'This request is no longer valid (already processed or cancelled).',
    'এই কাজের অনুমতি আপনার নেই': 'You do not have permission for this action.',
    'আবেদনটি আর খোলা নেই': 'This request is no longer open.',
    'বই গ্রহণের অনুমতি আপনার নেই': 'You do not have permission to receive books.',
    'বইয়ের অবস্থা সঠিক নয়': 'Invalid book condition.',
    'এই বই ইতোমধ্যে ফেরত নেওয়া হয়েছে বা ইস্যু করা নেই': 'This book was already returned or is not issued.',
    'আবেদনটি পাওয়া যায়নি': 'Request not found.',
    'রোল, রেজি. নম্বর বা নাম লিখুন': 'Enter a roll, registration number or name.',
    'নতুন তারিখ বেছে নিন': 'Choose a new date.',
    'বইটি এখন ইস্যু অবস্থায় নেই': 'This book is not currently issued.',
    'নতুন তারিখ বর্তমান ফেরতের তারিখের পরে হতে হবে': 'The new date must be after the current due date.',
    'আজ থেকে সর্বোচ্চ ১২০ দিন পর্যন্ত বাড়ানো যাবে': 'The due date can be extended up to 120 days from today.',
    'রিপোর্ট দেখার অনুমতি আপনার নেই': 'You do not have permission to view reports.',
    'শিক্ষার্থী পাওয়া যায়নি': 'Student not found.',
    'শুধু Admin বই যোগ করতে পারবেন': 'Only Admin can add books.',
    'এক সঙ্গে ১ থেকে ১০০০টি বই দেওয়া যাবে': 'You can submit 1 to 1000 books at a time.',
    'শুধু Admin বইয়ের তথ্য বদলাতে পারবেন': 'Only Admin can edit book details.',
    'শুধু Admin স্টক সংশোধন করতে পারবেন': 'Only Admin can correct stock.',
    'অবস্থা সঠিক নয়': 'Invalid status.',
    'সংশোধনের কারণ লিখুন': 'Enter a reason for the correction.',
    'বইটি এখন শিক্ষার্থীর কাছে আছে; আগে ফেরত নিন': 'This book is with a student. Receive the return first.',
    'বইটি ইতোমধ্যে এই অবস্থায় আছে': 'The book is already in this status.',
    'শুধু Admin': 'Admin only.',
    'শুধু Admin দায়িত্ব দিতে পারবেন': 'Only Admin can assign Seminar staff.',
    'শিক্ষক পাওয়া যায়নি': 'Teacher not found.',
    'শুধু Admin নিয়ম বদলাতে পারবেন': 'Only Admin can change the rules.',
    'বইয়ের সংখ্যা ১–২০ এবং দিন ১–১২০ এর মধ্যে দিন': 'Max books must be 1–20 and loan days 1–120.',
    'সঠিক মোবাইল নম্বর দিন (১১ সংখ্যা)': 'Enter a valid 11-digit mobile number.',
    'এই বইয়ের আবেদন আপনি ইতোমধ্যে করেছেন': 'You have already requested this book.',
    'বইটি এখন স্টকে নেই': 'This book is not in stock right now.',
    'আগের বই ফেরত না দেওয়া পর্যন্ত নতুন আবেদন করা যাবে না': 'You cannot request new books until your overdue books are returned.',
    'এই আবেদন বাতিল করা যাবে না': 'This request cannot be cancelled.'
  };
  const MSG_RE = [
    [/^এই শিক্ষার্থীর কাছে ইতোমধ্যে সর্বোচ্চ সংখ্যক বই \((\d+)টি\) আছে$/, 'This student already holds the maximum number of books ($1).'],
    [/^এই বইটি এখন স্টকে নেই \(অবস্থা: (.+)\)$/, 'This book is not in stock (status: $1).'],
    [/^এই শিক্ষার্থীর (\d+)টি বই ফেরত দেওয়ার সময় পার হয়েছে$/, 'This student has $1 overdue book(s).'],
    [/^আপনি সর্বোচ্চ (\d+)টি বইয়ের আবেদন\/গ্রহণ করতে পারবেন$/, 'You can request or hold at most $1 books.']
  ];
  const DATA_TXT = {
    'বইটি অন্য শিক্ষার্থীকে দেওয়া হয়েছে': 'Book was issued to another student',
    '(ক্যাটাগরি নেই)': '(No category)',
    'নাম/লেখক/ক্যাটাগরি হালনাগাদ': 'Title / author / category updated',
    'তথ্য সংশোধন': 'Details corrected'
  };
  const BN = /[\u0980-\u09FF]/;
  function tr(m) {
    if (!m) return 'Something went wrong. Please try again.';
    m = String(m);
    if (MSG[m]) return MSG[m];
    for (const [re, to] of MSG_RE) if (re.test(m)) return m.replace(re, to);
    return BN.test(m) ? 'Something went wrong. Please try again.' : m;
  }
  const trData = s => (s == null ? '' : (DATA_TXT[s] || s));

  const L = {
    book: { available: 'Available', issued: 'Issued', damaged: 'Damaged', lost: 'Lost', withdrawn: 'Withdrawn' },
    loan: { requested: 'Requested', issued: 'Issued', returned: 'Returned', rejected: 'Rejected', cancelled: 'Cancelled' },
    cond: { good: 'Good', minor_damage: 'Minor damage', major_damage: 'Major damage', lost: 'Lost' },
    act: { add: 'Added', edit: 'Edited', issue: 'Issued', return: 'Returned', damaged: 'Marked damaged', lost: 'Marked lost', correction: 'Stock correction', withdraw: 'Withdrawn' }
  };
  const BADGE = { available: 'bg-emerald-100 text-emerald-700', issued: 'bg-amber-100 text-amber-700', damaged: 'bg-orange-100 text-orange-700',
                  lost: 'bg-red-100 text-red-700', withdrawn: 'bg-gray-200 text-gray-700', requested: 'bg-blue-100 text-blue-700',
                  returned: 'bg-emerald-100 text-emerald-700', rejected: 'bg-red-100 text-red-700', cancelled: 'bg-gray-200 text-gray-700' };
  const badge = (key, label) => `<span class="text-xs px-2 py-0.5 rounded-full font-semibold ${BADGE[key] || 'bg-gray-200 text-gray-700'}">${esc(label)}</span>`;

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(v) {
    if (!v) return '-';
    const s = String(v);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return `${m[3]} ${MON[+m[2] - 1]} ${m[1]}`;
    try { return new Date(s).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return s; }
  }
  function todayStr() { try { if (typeof getBangladeshNow === 'function') return getBangladeshNow().dateStr; } catch (e) {} return new Date().toISOString().slice(0, 10); }
  function addDays(ds, n) { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
  const yl = y => { try { return typeof yearLabel === 'function' ? yearLabel(y) : (y || ''); } catch (e) { return y || ''; } };
  const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
  const enDigits = s => String(s == null ? '' : s).replace(/[০-৯]/g, d => String(BN_DIGITS.indexOf(d)));
  const normNo = s => enDigits(s).replace(/\s+/g, '').toUpperCase();
  function normMobile(s) {
    let m = enDigits(s).replace(/[\s-]/g, '').replace(/^\+?88/, '');
    return /^01[3-9][0-9]{8}$/.test(m) ? m : null;
  }
  const studentLine = r => `${esc(r.student_name || r.name)} · ${esc(yl(r.year))}${r.session_year ? ' (' + esc(r.session_year) + ')' : ''} · Roll ${esc(r.class_roll)}`;

  // ---------- database calls (always returns {ok, message, ...data}) ----------
  async function call(fn, args) {
    try {
      const { data, error } = await db.rpc(fn, args);
      if (error) return { ok: false, rpcError: true, message: 'Connection problem. Please check your internet and try again.' };
      if (!data || data.ok === false) return { ok: false, message: tr(data && data.message) };
      return data;
    } catch (e) { return { ok: false, message: 'Connection problem. Please check your internet and try again.' }; }
  }
  const staffCall = (fn, args) => call(fn, Object.assign({ p_token: tok() }, args || {}));
  const studCall = (fn, args) => call(fn, Object.assign({ p_student_token: (typeof currentStudentToken !== 'undefined' ? currentStudentToken : null) }, args || {}));
  const busy = on => { try { on ? showGlobalLoader() : hideGlobalLoader(); } catch (e) {} };
  const warn = m => { try { toastWarning(m); } catch (e) { alert(m); } };
  const okMsg = m => { try { toastSuccess(m); } catch (e) {} };
  const errMsg = m => { try { toastError(m); } catch (e) { alert(m); } };
  const loadingHtml = () => '<div class="text-center py-8 text-gray-500">⏳ Loading...</div>';
  const errHtml = m => `<div class="text-center py-8"><p class="text-red-500 mb-3">❌ ${esc(m)}</p><button onclick="SEM.go(SEM.tab())" class="bg-indigo-600 ${BTN.replace('px-4 py-2 rounded-lg font-bold btn-pop text-white', 'px-4 py-2 rounded-lg btn-pop text-white')}">Retry</button></div>`;
  const empty = (icon, t) => `<div class="${CARD} p-8 text-center"><p class="text-4xl mb-2">${icon}</p><p class="text-gray-500 dark:text-gray-400">${esc(t)}</p></div>`;

  async function loadBooks(force) {
    if (S.books && !force) return S.books;
    const r = await staffCall('sem_books');
    if (r.ok) S.books = r.items || [];
    return r.ok ? S.books : null;
  }
  async function loadSettings(force) {
    if (S.settings && !force) return S.settings;
    const r = await staffCall('sem_settings_get');
    if (r.ok) S.settings = r;
    return S.settings;
  }

  // ============================================================
  // EXPORT (Excel / PDF)
  // ============================================================
  function exportXlsx(name, sheet, headers, rows) {
    if (typeof XLSX === 'undefined') return warn('Excel library not loaded. Check your internet connection.');
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, String(sheet).slice(0, 30));
    XLSX.writeFile(wb, name + '.xlsx');
  }
  async function exportPdf(name, title, headers, rows) {
    if (!window.jspdf) return warn('PDF library not loaded. Check your internet connection.');
    busy(true);
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
      let bn = false;
      try { bn = await setupBanglaFont(doc); } catch (e) {}
      doc.setFontSize(14); doc.text(title, 14, 14);
      doc.setFontSize(9); doc.text('Department of Economics, Anandamohan College — Seminar Library', 14, 20);
      doc.text('Generated: ' + fmtDate(todayStr()), 14, 25);
      const font = bn ? 'HindSiliguri' : 'helvetica';
      doc.autoTable({ head: [headers], body: rows, startY: 29, styles: { fontSize: 8, font }, headStyles: { fillColor: [79, 70, 229], font, fontStyle: 'normal' }, alternateRowStyles: { fillColor: [245, 247, 255] }, showHead: 'everyPage' });
      doc.save(name + '.pdf');
    } catch (e) { console.error(e); errMsg('Could not create the PDF.'); } finally { busy(false); }
  }
  const exportBar = () => `<div class="flex gap-2 mb-3"><button onclick="SEM.exp('xlsx')" class="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold btn-pop">📊 Excel</button><button onclick="SEM.exp('pdf')" class="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold btn-pop">📄 PDF</button></div>`;
  function setRep(name, title, headers, rows) { S.rep = { name: name + '_' + todayStr(), title, headers, rows }; }
  function exp(kind) {
    const r = S.rep; if (!r || !r.rows.length) return warn('Nothing to export yet.');
    return kind === 'xlsx' ? exportXlsx(r.name, r.title, r.headers, r.rows) : exportPdf(r.name, r.title, r.headers, r.rows);
  }

  // ============================================================
  // FRAME + NAVIGATION (shared by Admin panel and Teacher panel)
  // ============================================================
  // Both panels can stay in the page; make sure only ONE Seminar frame (one #semBody) ever exists.
  function clearFrames() { ['adminContent', 'teacherContent'].forEach(id => { const el = $(id); if (el && el.querySelector('#semNav')) el.innerHTML = ''; }); }
  function open(role) {
    clearFrames();
    S.role = role; S.active = true;
    const box = role === 'admin' ? $('adminContent') : $('teacherContent');
    if (!box) return;
    const tabs = [['overview', '📊 Overview'], ['issue', '📤 Issue'], ['requests', '📥 Requests'], ['return', '↩️ Return'], ['overdue', '⏰ Overdue'], ['registrations', '📝 Registrations'], ['books', '📚 Books'], ['entries', '🧾 Entries'], ['reports', '📑 Reports']];
    if (role === 'admin') tabs.push(['add', '➕ Add Books'], ['staff', '👥 Staff'], ['settings', '⚙️ Rules']);
    if (!tabs.some(t => t[0] === S.tab)) S.tab = 'overview';
    box.innerHTML = `<div class="max-w-5xl">
      <h3 class="text-xl font-bold dark:text-white mb-3">📚 Seminar Library</h3>
      <div id="semNav" class="tab-strip scroll mb-4">${tabs.map(t => `<button onclick="SEM.go('${t[0]}')" data-t="${t[0]}" class="tab-pill">${t[1]}</button>`).join('')}</div>
      <div id="semBody"></div></div>`;
    go(S.tab);
    refreshRegBadge();
  }
  async function refreshRegBadge() {
    try {
      const r = await staffCall('sem_reg_list', { p_status: 'pending', p_query: null });
      const b = document.querySelector('#semNav [data-t="registrations"]');
      if (r.ok && b) b.textContent = '📝 Registrations' + ((r.items || []).length ? ' (' + r.items.length + ')' : '');
    } catch (e) {}
  }
  function go(tab) {
    S.tab = tab;
    const nav = $('semNav');
    if (nav) nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.t === tab));
    const body = $('semBody'); if (!body) return;
    body.innerHTML = loadingHtml();
    const v = { overview: vOverview, issue: vIssue, requests: vRequests, return: vReturn, overdue: vOverdue, registrations: vRegs, books: vBooks, entries: vEntries, reports: vReports, add: vAdd, staff: vStaff, settings: vSettings }[tab];
    if (v) v(body).catch(e => { console.error('Seminar view error', e); if (alive(tab)) body.innerHTML = errHtml('Could not load this page.'); });
  }

  // ============================================================
  // OVERVIEW (current stock)
  // ============================================================
  async function vOverview(body) {
    const r = await staffCall('sem_stock_summary');
    if (!alive('overview')) return;
    if (!r.ok) { body.innerHTML = errHtml(r.message); return; }
    const s = r.summary || {}, cats = r.by_category || [];
    const card = (label, v, cls) => `<div class="${cls} rounded-xl p-3 text-center"><p class="text-2xl font-extrabold num-display">${v || 0}</p><p class="text-[11px] font-semibold opacity-80">${label}</p></div>`;
    const rows = cats.map(c => [trData(c.category), c.total, c.issued, c.available]);
    setRep('seminar_stock', 'Seminar Library — Current Stock', ['Category', 'Total', 'With students', 'Available'],
      [...rows, ['TOTAL', s.total || 0, s.issued || 0, s.available || 0]]);
    body.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        ${card('Total books', s.total, 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300')}
        ${card('Available', s.available, 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300')}
        ${card('With students', s.issued, 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}
        ${card('Overdue', s.overdue, 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300')}
        ${card('Pending requests', s.pending_requests, 'bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300')}
        ${card('Damaged', s.damaged, 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300')}
        ${card('Lost', s.lost, 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200')}
        ${card('Books without title', s.without_title, 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200')}
      </div>
      <div class="flex justify-between items-center flex-wrap gap-2 mb-2"><h4 class="font-bold dark:text-white">Stock by category</h4>${exportBar()}</div>
      ${cats.length ? `<div class="overflow-x-auto"><table class="w-full text-sm dark:text-white"><thead><tr class="text-left border-b dark:border-gray-600"><th class="py-2">Category</th><th class="text-right">Total</th><th class="text-right">With students</th><th class="text-right">Available</th></tr></thead><tbody>
      ${cats.map(c => `<tr class="border-b dark:border-gray-700"><td class="py-2">${esc(trData(c.category))}</td><td class="text-right num-display">${c.total}</td><td class="text-right num-display">${c.issued}</td><td class="text-right num-display">${c.available}</td></tr>`).join('')}
      </tbody></table></div>` : empty('📚', S.role === 'admin' ? 'No books yet. Open “Add Books” to add your first books.' : 'No books have been added yet.')}`;
  }

  // ============================================================
  // ISSUE (walk-in): find student → choose book → issue
  // ============================================================
  async function vIssue(body) {
    const [bk, st] = await Promise.all([loadBooks(true), loadSettings()]);
    if (!alive('issue')) return;
    if (!bk) { body.innerHTML = errHtml('Could not load the book list.'); return; }
    renderIssue(body);
  }
  function renderIssue(body) {
    body = body || $('semBody'); if (!body || S.tab !== 'issue') return;
    const sel = S.sel;
    body.innerHTML = `<div class="max-w-2xl space-y-4">
      <div class="${CARD}">
        <p class="font-bold dark:text-white mb-2">1 · Find the student</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input id="semStQ" class="${INP} sm:col-span-2" placeholder="Class roll, registration no. or name" onkeydown="if(event.key==='Enter')SEM.findStudent()">
          <input id="semStSess" class="${INP}" placeholder="Session (optional) e.g. 2024-25" onkeydown="if(event.key==='Enter')SEM.findStudent()">
        </div>
        <button onclick="SEM.findStudent()" class="${BTN} bg-indigo-600 mt-2 w-full">🔍 Search</button>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">A roll number can belong to students in different years — check the year and session shown in the results.</p>
        <div id="semStRes" class="mt-2 space-y-2"></div>
      </div>
      ${sel ? `<div class="bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-300 dark:border-emerald-700 rounded-xl p-3">
        <div class="flex justify-between items-start gap-2"><div><p class="font-bold dark:text-white">${esc(sel.name)}</p>
        <p class="text-xs text-gray-600 dark:text-gray-300">${esc(yl(sel.year))} · Session ${esc(sel.session || sel.session_year || '-')} · Roll ${esc(sel.class_roll)}${sel.reg_no ? ' · Reg ' + esc(sel.reg_no) : ''}</p>
        <p class="text-xs mt-1">Holding <b>${sel.issued_count || 0}</b> book(s)${sel.overdue_count ? ` · <span class="text-red-600 font-bold">${sel.overdue_count} overdue</span>` : ''}</p></div>
        <button onclick="SEM.clearStudent()" class="text-xs bg-white dark:bg-gray-700 dark:text-white px-2 py-1 rounded-lg border">Change</button></div></div>
      <div class="${CARD}">
        <p class="font-bold dark:text-white mb-2">2 · Book and due date</p>
        <input id="semBookNo" class="${INP}" placeholder="Type the book number or title" autocomplete="off" oninput="SEM.suggest()">
        <div id="semSug" class="mt-1"></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          <div><label class="text-xs font-semibold dark:text-white">Student mobile (11 digits)</label><input id="semMobile" type="tel" inputmode="numeric" class="${INP}" placeholder="01XXXXXXXXX"></div>
          <div><label class="text-xs font-semibold dark:text-white">Due date</label><input id="semDue" type="date" class="${INP}" min="${todayStr()}" value="${addDays(todayStr(), (S.settings && S.settings.loan_days) || 14)}"></div>
        </div>
        ${S.role === 'admin' ? '<label class="flex items-center gap-2 text-sm mt-2 dark:text-white"><input type="checkbox" id="semForce"> Override limits (maximum books / overdue block) — Admin only</label>' : ''}
        <button id="semIssueBtn" onclick="SEM.doIssue()" class="${BTN} bg-emerald-600 mt-3 w-full">📤 Issue Book</button>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Limit: ${(S.settings && S.settings.max_books) || 3} books per student${S.settings && S.settings.block_if_overdue ? ' · new books are blocked while a book is overdue' : ''}.</p>
      </div>` : ''}</div>`;
  }
  async function findStudent() {
    const q = ($('semStQ') || {}).value || '', sess = ($('semStSess') || {}).value || '';
    if (!q.trim()) return warn('Enter a roll, registration number or name.');
    const box = $('semStRes'); box.innerHTML = '<p class="text-sm text-gray-500">Searching…</p>';
    const r = await staffCall('sem_find_student', { p_query: q, p_session: sess.trim() || null });
    if (!alive('issue')) return;
    if (!r.ok) { box.innerHTML = `<p class="text-sm text-red-600">${esc(r.message)}</p>`; return; }
    S.found = {}; (r.items || []).forEach(s => { S.found[s.student_id] = s; });
    box.innerHTML = (r.items || []).length ? r.items.map(s => `<div class="flex justify-between items-center gap-2 bg-white dark:bg-gray-800 rounded-xl p-2 border dark:border-gray-600">
        <div class="min-w-0"><p class="font-semibold text-sm dark:text-white truncate">${esc(s.name)}</p>
        <p class="text-xs text-gray-500 dark:text-gray-400">${esc(yl(s.year))} · Session ${esc(s.session || s.session_year || '-')} · Roll ${esc(s.class_roll)}${s.reg_no ? ' · Reg ' + esc(s.reg_no) : ''} · holding ${s.issued_count}${s.overdue_count ? ` · <b class="text-red-600">${s.overdue_count} overdue</b>` : ''}</p></div>
        <button onclick="SEM.pick('${esc(s.student_id)}')" class="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold flex-shrink-0">Select</button></div>`).join('')
      : '<p class="text-sm text-gray-500">No active student found.</p>';
  }
  function pick(id) { if (!S.found[id]) return; S.sel = S.found[id]; S.found = {}; renderIssue(); setTimeout(() => { const b = $('semBookNo'); if (b) b.focus(); }, 50); }
  function clearStudent() { S.sel = null; renderIssue(); }
  function suggest() {
    const inp = $('semBookNo'), box = $('semSug'); if (!inp || !box) return;
    const raw = inp.value.trim(); if (!raw) { box.innerHTML = ''; return; }
    const n = normNo(raw), low = raw.toLowerCase();
    const list = (S.books || []).filter(b => b.book_no.includes(n) || (b.title || '').toLowerCase().includes(low) || (b.author || '').toLowerCase().includes(low));
    list.sort((a, b) => (b.book_no === n) - (a.book_no === n) || (b.status === 'available') - (a.status === 'available') || a.book_no.localeCompare(b.book_no, undefined, { numeric: true }));
    box.innerHTML = list.slice(0, 8).map(b => b.status === 'available'
      ? `<button type="button" onclick="SEM.chooseBook('${esc(b.id)}')" class="w-full text-left bg-white dark:bg-gray-800 dark:text-white border dark:border-gray-600 rounded-lg px-3 py-2 mb-1 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/40"><b>${esc(b.book_no)}</b> — ${esc(b.title || '(title not entered yet)')} ${b.author ? '<span class="text-xs text-gray-500">· ' + esc(b.author) + '</span>' : ''}</button>`
      : `<div class="w-full bg-gray-100 dark:bg-gray-700 text-gray-400 border dark:border-gray-600 rounded-lg px-3 py-2 mb-1 text-sm"><b>${esc(b.book_no)}</b> — ${esc(b.title || '(no title)')} ${badge(b.status, L.book[b.status] || b.status)}</div>`).join('')
      || '<p class="text-xs text-gray-500">No matching book.</p>';
  }
  function chooseBook(id) { const b = (S.books || []).find(x => x.id === id); if (!b) return; $('semBookNo').value = b.book_no; $('semSug').innerHTML = `<p class="text-xs text-emerald-600 font-semibold">✓ ${esc(b.book_no)} — ${esc(b.title || '(title not entered yet)')}</p>`; }
  async function doIssue() {
    const st = S.sel; if (!st) return warn('Select a student first.');
    const no = normNo(($('semBookNo') || {}).value); if (!no) return warn('Enter the book number.');
    const mob = normMobile(($('semMobile') || {}).value); if (!mob) return warn('Enter a valid 11-digit mobile number (needed for overdue reminders).');
    const due = ($('semDue') || {}).value;
    const force = !!($('semForce') && $('semForce').checked);
    const btn = $('semIssueBtn'); if (btn) btn.disabled = true; busy(true);
    const r = await staffCall('sem_issue_direct', { p_student_id: st.student_id, p_book_no: no, p_mobile: mob, p_due: due || null, p_force: force });
    busy(false); if (btn) btn.disabled = false;
    if (!r.ok) return errMsg(r.message);
    okMsg(`Issued ${no} to ${st.name} · due ${fmtDate(r.due_date)}`);
    staffCall('sem_reg_staff_add', { p_student_id: st.student_id, p_mobile: mob, p_reg_no: null }).catch(() => {});   // desk issue = registered + approved
    const b = (S.books || []).find(x => x.book_no === no); if (b) b.status = 'issued';
    st.issued_count = (st.issued_count || 0) + 1;
    renderIssue();
  }

  // ============================================================
  // REQUESTS (student applications)
  // ============================================================
  async function vRequests(body) {
    const r = await staffCall('sem_pending');
    if (!alive('requests')) return;
    if (!r.ok) { body.innerHTML = errHtml(r.message); return; }
    S.pending = r.items || [];
    await loadSettings();
    if (!alive('requests')) return;
    body.innerHTML = S.pending.length ? `<div class="space-y-2">${S.pending.map(p => `<div class="${CARD}">
      <div class="flex justify-between items-start gap-2 flex-wrap">
        <div class="min-w-0"><p class="font-bold dark:text-white">${esc(p.book_no)} — ${esc(p.title || '(title not entered yet)')} ${p.book_status !== 'available' ? badge(p.book_status, L.book[p.book_status] || p.book_status) : ''}</p>
        <p class="text-sm dark:text-gray-200">${esc(p.student_name)} · ${esc(yl(p.year))}${p.session_year ? ' (' + esc(p.session_year) + ')' : ''} · Roll ${esc(p.class_roll)}</p>
        <p class="text-xs text-gray-500 dark:text-gray-400">Mobile ${esc(p.mobile || '-')} · requested ${esc(fmtDate(p.requested_at))} · holding ${p.student_issued_count}${p.student_overdue_count ? ` · <b class="text-red-600">${p.student_overdue_count} overdue</b>` : ''}</p></div>
        <div class="flex gap-2"><button onclick="SEM.issueReq('${esc(p.loan_id)}')" class="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">Issue</button>
        <button onclick="SEM.rejectReq('${esc(p.loan_id)}')" class="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold">Reject</button></div>
      </div></div>`).join('')}</div>` : empty('📥', 'No pending requests.');
  }
  async function issueReq(id) {
    const p = (S.pending || []).find(x => x.loan_id === id); if (!p) return;
    const days = (S.settings && S.settings.loan_days) || 14;
    const res = await Swal.fire({ title: 'Issue this book?', html: `<p style="margin-bottom:8px"><b>${esc(p.book_no)}</b> → ${esc(p.student_name)}</p><label style="font-size:13px">Due date</label><input id="swDue" type="date" class="swal2-input" min="${todayStr()}" value="${addDays(todayStr(), days)}">${S.role === 'admin' ? '<label style="font-size:13px"><input type="checkbox" id="swForce"> Override limits (Admin)</label>' : ''}`,
      showCancelButton: true, confirmButtonText: 'Issue', confirmButtonColor: '#059669', preConfirm: () => ({ due: $('swDue').value, force: !!($('swForce') && $('swForce').checked) }) });
    if (!res.isConfirmed) return;
    busy(true);
    const r = await staffCall('sem_issue_request', { p_loan_id: id, p_due: res.value.due || null, p_force: res.value.force });
    busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Book issued · due ' + fmtDate(r.due_date)); S.books = null; go('requests');
  }
  async function rejectReq(id) {
    const res = await Swal.fire({ title: 'Reject this request?', input: 'text', inputPlaceholder: 'Reason (shown to the student)', showCancelButton: true, confirmButtonText: 'Reject', confirmButtonColor: '#dc2626' });
    if (!res.isConfirmed) return;
    busy(true); const r = await staffCall('sem_reject', { p_loan_id: id, p_reason: res.value || null }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Request rejected'); go('requests');
  }

  // ============================================================
  // RETURN
  // ============================================================
  async function vReturn(body) {
    const r = await staffCall('sem_issued', { p_student_id: null });
    if (!alive('return')) return;
    if (!r.ok) { body.innerHTML = errHtml(r.message); return; }
    S.issued = r.items || [];
    body.innerHTML = `<input id="semRetQ" class="${INP} mb-3" placeholder="Search by book number, title, student name or roll" oninput="SEM.filterReturn()"><p class="text-xs text-gray-500 mb-2"><span id="semRetCount"></span></p><div id="semRetList" class="space-y-2"></div>`;
    filterReturn();
  }
  function filterReturn() {
    const q = (($('semRetQ') || {}).value || '').trim().toLowerCase(), n = normNo(q);
    const list = (S.issued || []).filter(i => !q || i.book_no.includes(n) || (i.title || '').toLowerCase().includes(q) || (i.student_name || '').toLowerCase().includes(q) || String(i.class_roll || '').toLowerCase() === q);
    const c = $('semRetCount'); if (c) c.textContent = `${list.length} book(s) currently issued`;
    const box = $('semRetList'); if (!box) return;
    box.innerHTML = list.length ? list.slice(0, 100).map(i => `<div class="${CARD} flex justify-between items-center gap-2 flex-wrap">
      <div class="min-w-0"><p class="font-bold dark:text-white">${esc(i.book_no)} — ${esc(i.title || '(no title)')}</p>
      <p class="text-sm dark:text-gray-200">${studentLine(i)}</p>
      <p class="text-xs text-gray-500 dark:text-gray-400">Issued ${esc(fmtDate(i.issued_at))} · due ${esc(fmtDate(i.due_date))} ${i.days_late > 0 ? `<b class="text-red-600">· ${i.days_late} day(s) late</b>` : ''}</p></div>
      <div class="flex gap-2"><button onclick="SEM.doReturn('${esc(i.loan_id)}')" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">Return</button>
      <button onclick="SEM.extend('${esc(i.loan_id)}')" class="bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold">Extend</button></div></div>`).join('')
      : empty('✅', q ? 'No matching issued book.' : 'No books are currently issued.');
  }
  async function doReturn(id) {
    const i = (S.issued || []).find(x => x.loan_id === id); if (!i) return;
    const res = await Swal.fire({ title: 'Receive this book', html: `<p style="margin-bottom:8px"><b>${esc(i.book_no)}</b> — ${esc(i.student_name)}</p>
      <select id="swCond" class="swal2-select" style="display:flex;width:80%"><option value="good">Good condition</option><option value="minor_damage">Minor damage (still usable)</option><option value="major_damage">Major damage (remove from stock)</option><option value="lost">Lost</option></select>
      <input id="swNote" class="swal2-input" placeholder="Note (optional)">`,
      showCancelButton: true, confirmButtonText: 'Receive', confirmButtonColor: '#4f46e5', preConfirm: () => ({ cond: $('swCond').value, note: $('swNote').value }) });
    if (!res.isConfirmed) return;
    busy(true); const r = await staffCall('sem_return', { p_loan_id: id, p_condition: res.value.cond, p_note: res.value.note || null }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Book received'); S.books = null; go('return');
  }
  async function extend(id) {
    const i = (S.issued || []).find(x => x.loan_id === id); if (!i) return;
    const res = await Swal.fire({ title: 'Extend due date', html: `<p style="margin-bottom:8px">Current due date: <b>${esc(fmtDate(i.due_date))}</b></p><input id="swNew" type="date" class="swal2-input" min="${addDays(i.due_date, 1)}" value="${addDays(i.due_date > todayStr() ? i.due_date : todayStr(), 7)}">`,
      showCancelButton: true, confirmButtonText: 'Extend', confirmButtonColor: '#d97706', preConfirm: () => $('swNew').value });
    if (!res.isConfirmed) return;
    busy(true); const r = await staffCall('sem_extend_due', { p_loan_id: id, p_new_due: res.value }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('New due date: ' + fmtDate(r.due_date)); go('return');
  }

  // ============================================================
  // OVERDUE (+ call / WhatsApp reminder links)
  // ============================================================
  function waLink(o) {
    const m = normMobile(o.mobile); if (!m) return '';
    const msg = `Dear ${o.student_name}, the Seminar Library book ${o.book_no}${o.title ? ' (' + o.title + ')' : ''} was due on ${fmtDate(o.due_date)}. Please return it as soon as possible. — Department of Economics, Anandamohan College`;
    return `https://wa.me/88${m}?text=${encodeURIComponent(msg)}`;
  }
  async function vOverdue(body) {
    const r = await staffCall('sem_overdue');
    if (!alive('overdue')) return;
    if (!r.ok) { body.innerHTML = errHtml(r.message); return; }
    const items = r.items || [];
    setRep('seminar_overdue', 'Seminar Library — Overdue Books', ['Student', 'Year', 'Session', 'Roll', 'Mobile', 'Book No', 'Title', 'Due date', 'Days late'],
      items.map(o => [o.student_name, yl(o.year), o.session_year || '', o.class_roll, o.mobile || '', o.book_no, o.title || '', fmtDate(o.due_date), o.days_late]));
    body.innerHTML = items.length ? `<div class="flex justify-between items-center flex-wrap gap-2 mb-3"><p class="font-bold text-red-600">${items.length} overdue book(s)</p>${exportBar()}</div>
      <div class="space-y-2">${items.map(o => { const wa = waLink(o); return `<div class="${CARD} border-l-4 border-red-500">
        <div class="flex justify-between items-start gap-2 flex-wrap"><div class="min-w-0"><p class="font-bold dark:text-white">${esc(o.student_name)}</p>
        <p class="text-xs text-gray-600 dark:text-gray-300">${esc(yl(o.year))}${o.session_year ? ' (' + esc(o.session_year) + ')' : ''} · Roll ${esc(o.class_roll)} · Mobile ${esc(o.mobile || '-')}</p>
        <p class="text-sm dark:text-gray-200">${esc(o.book_no)} — ${esc(o.title || '(no title)')}</p>
        <p class="text-xs text-red-600 font-bold">Due ${esc(fmtDate(o.due_date))} · ${o.days_late} day(s) late</p></div>
        <div class="flex gap-2">${o.mobile ? `<a href="tel:${esc(o.mobile)}" class="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">📞 Call</a>` : ''}${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">💬 WhatsApp reminder</a>` : ''}</div></div></div>`; }).join('')}</div>`
      : empty('🎉', 'No overdue books.');
  }

  // ============================================================
  // BOOKS (list, edit, status, history)
  // ============================================================
  async function vBooks(body) {
    const bk = await loadBooks(true);
    if (!alive('books')) return;
    if (!bk) { body.innerHTML = errHtml('Could not load the book list.'); return; }
    S.bookPage = 0;
    body.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
      <input id="semBkQ" class="${INP} sm:col-span-2" placeholder="Search by number, title, author or category" oninput="SEM.filterBooks(true)">
      <select id="semBkSt" class="${INP}" onchange="SEM.filterBooks(true)"><option value="">All statuses</option><option value="available">Available</option><option value="issued">Issued</option><option value="damaged">Damaged</option><option value="lost">Lost</option><option value="withdrawn">Withdrawn</option></select></div>
      <label class="flex items-center gap-2 text-sm mb-3 dark:text-white"><input type="checkbox" id="semBkNoTitle" onchange="SEM.filterBooks(true)"> Only books without a title</label>
      <p id="semBkCount" class="text-xs text-gray-500 mb-2"></p><div id="semBkList" class="space-y-2"></div><div id="semBkPager" class="flex justify-center gap-2 mt-3"></div>`;
    filterBooks(true);
  }
  function filterBooks(reset) {
    if (reset) S.bookPage = 0;
    const q = (($('semBkQ') || {}).value || '').trim().toLowerCase(), n = normNo(q), st = ($('semBkSt') || {}).value, nt = !!($('semBkNoTitle') || {}).checked;
    const list = (S.books || []).filter(b => (!st || b.status === st) && (!nt || !b.title) &&
      (!q || b.book_no.includes(n) || (b.title || '').toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q) || (b.category || '').toLowerCase().includes(q)));
    const PER = 40, pages = Math.max(1, Math.ceil(list.length / PER)); S.bookPage = Math.min(S.bookPage, pages - 1);
    const c = $('semBkCount'); if (c) c.textContent = `${list.length} book(s)`;
    const admin = S.role === 'admin';
    const box = $('semBkList'); if (!box) return;
    box.innerHTML = list.length ? list.slice(S.bookPage * PER, (S.bookPage + 1) * PER).map(b => `<div class="${CARD} flex justify-between items-center gap-2 flex-wrap">
      <div class="min-w-0"><p class="font-bold dark:text-white"><span class="num-display">${esc(b.book_no)}</span> — ${b.title ? esc(b.title) : '<i class="text-gray-400">title not entered</i>'} ${badge(b.status, L.book[b.status] || b.status)}</p>
      <p class="text-xs text-gray-500 dark:text-gray-400">${esc(b.author || '-')} · ${esc(b.category || 'No category')}</p></div>
      <div class="flex gap-1 flex-wrap"><button onclick="SEM.history('${esc(b.id)}')" class="bg-gray-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold">History</button>
      ${admin ? `<button onclick="SEM.editBook('${esc(b.id)}')" class="bg-amber-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold">Edit</button><button onclick="SEM.bookStatus('${esc(b.id)}')" class="bg-indigo-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold">Status</button><button onclick="SEM.deleteBook('${esc(b.id)}')" class="bg-red-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold">Delete</button>` : ''}</div></div>`).join('')
      : empty('📚', 'No books match.');
    const pg = $('semBkPager');
    if (pg) pg.innerHTML = pages > 1 ? `<button ${S.bookPage ? '' : 'disabled'} onclick="SEM.bookPageGo(-1)" class="px-3 py-1 rounded-lg bg-gray-200 dark:bg-gray-600 dark:text-white text-sm disabled:opacity-40">‹ Prev</button><span class="text-sm self-center dark:text-white">Page ${S.bookPage + 1} / ${pages}</span><button ${S.bookPage < pages - 1 ? '' : 'disabled'} onclick="SEM.bookPageGo(1)" class="px-3 py-1 rounded-lg bg-gray-200 dark:bg-gray-600 dark:text-white text-sm disabled:opacity-40">Next ›</button>` : '';
  }
  function bookPageGo(d) { S.bookPage += d; filterBooks(false); }
  async function editBook(id) {
    const b = (S.books || []).find(x => x.id === id); if (!b) return;
    const cats = [...new Set((S.books || []).map(x => x.category).filter(Boolean))];
    const res = await Swal.fire({ title: 'Edit book ' + b.book_no, html: `<input id="swT" class="swal2-input" placeholder="Title" value="${esc(b.title || '')}" maxlength="200"><input id="swA" class="swal2-input" placeholder="Author" value="${esc(b.author || '')}" maxlength="150"><input id="swC" list="swCats" class="swal2-input" placeholder="Category" value="${esc(b.category || '')}" maxlength="80"><datalist id="swCats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`,
      showCancelButton: true, confirmButtonText: 'Save', preConfirm: () => ({ t: $('swT').value, a: $('swA').value, c: $('swC').value }) });
    if (!res.isConfirmed) return;
    busy(true); const r = await staffCall('sem_admin_update_book', { p_book_id: id, p_title: res.value.t, p_author: res.value.a, p_category: res.value.c }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Book updated'); await loadBooks(true); filterBooks(false);
  }
  async function bookStatus(id) {
    const b = (S.books || []).find(x => x.id === id); if (!b) return;
    if (b.status === 'issued') return warn('This book is with a student. Receive the return first (Return tab).');
    const opts = ['available', 'damaged', 'lost', 'withdrawn'].filter(s => s !== b.status);
    const res = await Swal.fire({ title: `Stock correction · ${b.book_no}`, html: `<p style="margin-bottom:6px">Current status: <b>${esc(L.book[b.status] || b.status)}</b></p><select id="swS" class="swal2-select" style="display:flex;width:80%">${opts.map(s => `<option value="${s}">${L.book[s]}</option>`).join('')}</select><input id="swN" class="swal2-input" placeholder="Reason (required)" maxlength="300">`,
      showCancelButton: true, confirmButtonText: 'Apply', preConfirm: () => { const n = $('swN').value.trim(); if (!n) { Swal.showValidationMessage('Enter a reason for the correction'); return false; } return { s: $('swS').value, n }; } });
    if (!res.isConfirmed) return;
    busy(true); const r = await staffCall('sem_admin_set_book_status', { p_book_id: id, p_status: res.value.s, p_note: res.value.n }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Status updated'); await loadBooks(true); filterBooks(false);
  }
  async function history(id) {
    busy(true); const r = await staffCall('sem_report_book', { p_book_id: id }); busy(false);
    if (!r.ok) return errMsg(r.message);
    const b = r.book, loans = r.loans || [], log = r.stock_log || [];
    Swal.fire({ title: `Book ${esc(b.book_no)}`, width: 640, confirmButtonText: 'Close', html: `<div style="text-align:left;font-size:13px;max-height:60vh;overflow:auto">
      <p><b>${esc(b.title || '(title not entered)')}</b> · ${esc(b.author || '-')} · ${esc(b.category || 'No category')} · ${esc(L.book[b.status] || b.status)}</p>
      <h4 style="margin:10px 0 4px;font-weight:700">Loans (${loans.length})</h4>
      ${loans.length ? loans.map(l => `<div style="border-bottom:1px solid #ddd;padding:3px 0">${esc(l.student_name)} · ${esc(yl(l.year))} · Roll ${esc(l.class_roll)} — ${esc(L.loan[l.status] || l.status)}<br><span style="color:#777">Issued ${esc(fmtDate(l.issued_at))} · due ${esc(fmtDate(l.due_date))}${l.returned_at ? ' · returned ' + esc(fmtDate(l.returned_at)) + ' (' + esc(L.cond[l.return_condition] || '') + ')' : ''}</span></div>`).join('') : '<p style="color:#777">Never issued.</p>'}
      <h4 style="margin:10px 0 4px;font-weight:700">Stock history (${log.length})</h4>
      ${log.map(g => `<div style="border-bottom:1px solid #ddd;padding:3px 0">${esc(L.act[g.action] || g.action)}${g.old_status || g.new_status ? ` (${esc(g.old_status || '-')} → ${esc(g.new_status || '-')})` : ''} · ${esc(fmtDate(g.at))}${g.by ? ' · by ' + esc(g.by) : ''}${g.note ? `<br><span style="color:#777">${esc(trData(g.note))}</span>` : ''}</div>`).join('')}</div>` });
  }

  // ============================================================
  // ADD BOOKS (admin): manual entry grid + Excel/CSV upload
  // ============================================================
  function nextNo() {
    let max = -1, width = 0;
    (S.books || []).forEach(b => { if (/^\d+$/.test(b.book_no)) { const v = parseInt(b.book_no, 10); if (v > max) { max = v; width = b.book_no.length; } } });
    return max < 0 ? '' : String(max + 1).padStart(width, '0');
  }
  async function vAdd(body) {
    if (!(await loadBooks(true))) { if (alive('add')) body.innerHTML = errHtml('Could not load the book list.'); return; }
    if (!alive('add')) return;
    const cats = [...new Set((S.books || []).map(x => x.category).filter(Boolean))];
    body.innerHTML = `<div class="space-y-6 max-w-4xl">
      <div class="${CARD}">
        <h4 class="font-bold dark:text-white mb-1">✍️ Add books manually</h4>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Use this when new books are purchased. Only the <b>book number</b> is required — title, author and category can be added later. Total books now: <b>${S.books.length}</b>${nextNo() ? ` · next free number: <b>${esc(nextNo())}</b>` : ''}.</p>
        <div class="flex flex-wrap gap-2 items-end mb-3 bg-white dark:bg-gray-800 rounded-xl p-2 border dark:border-gray-600">
          <div><label class="text-xs font-semibold dark:text-white">Auto-number: start from</label><input id="semSeqStart" class="${INP}" style="width:120px" value="${esc(nextNo())}" placeholder="e.g. 0501"></div>
          <div><label class="text-xs font-semibold dark:text-white">How many</label><input id="semSeqCount" type="number" min="1" max="200" class="${INP}" style="width:90px" value="5"></div>
          <button onclick="SEM.fillSeq()" class="${BTN} bg-gray-600 text-sm">Fill numbers</button>
        </div>
        <datalist id="semCats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
        <div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left dark:text-white"><th class="pr-1">Book No *</th><th class="pr-1">Title</th><th class="pr-1">Author</th><th>Category</th></tr></thead><tbody id="semAddRows"></tbody></table></div>
        <div class="flex gap-2 flex-wrap mt-3"><button onclick="SEM.addRows(5)" class="${BTN} bg-gray-500 text-sm">+ 5 rows</button><button onclick="SEM.clearRows()" class="${BTN} bg-gray-500 text-sm">Clear</button><button id="semSaveBtn" onclick="SEM.saveRows()" class="${BTN} bg-emerald-600">💾 Save books</button></div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">If a number already exists, only the Title/Author/Category you fill in are updated; the book's status is never changed.</p>
        <div id="semAddResult" class="mt-2"></div>
      </div>
      <div class="${CARD}">
        <h4 class="font-bold dark:text-white mb-1">📊 Upload from Excel / CSV</h4>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Columns: <b>book_no</b>, title, author, category (first row = headers). Tip: format the book_no column as <b>Text</b> so numbers like 0125 keep their leading zeros. Up to 1000 books per upload step (larger files are sent in parts automatically).</p>
        <div class="flex flex-wrap gap-2 items-center"><input type="file" id="semFile" accept=".xlsx,.xls,.csv" onchange="SEM.onFile(this)" class="text-sm dark:text-white"><button onclick="SEM.template()" class="${BTN} bg-gray-600 text-sm">⬇️ Download template</button></div>
        <div id="semUpPreview" class="mt-3"></div>
      </div>
      <div class="${CARD}">
        <h4 class="font-bold dark:text-white mb-1">🕘 Import past records (books already given out)</h4>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">For students who already took books on paper. <b>Add the books first</b> (above), then upload one row per book: session, class_roll, year (only if the roll is not unique in that session), book_no, mobile, issued_on, and optionally due_on, returned_on, condition (good / minor_damage / major_damage / lost). Dates: 2026-03-15 or 15/03/2026 (day first). Nothing is saved until you press Import.</p>
        <div class="flex flex-wrap gap-2 items-center"><input type="file" accept=".xlsx,.xls,.csv" onchange="SEM.impFile(this)" class="text-sm dark:text-white"><button onclick="SEM.impTemplate()" class="${BTN} bg-gray-600 text-sm">⬇️ Download template</button></div>
        <div id="semImpOut" class="mt-3"></div>
      </div></div>`;
    S.addRows = 0; addRows(5);
  }
  const rowHtml = i => `<tr><td class="pr-1 pb-1"><input class="${INP}" style="min-width:90px" data-f="no" maxlength="30" placeholder="0501"></td><td class="pr-1 pb-1"><input class="${INP}" style="min-width:180px" data-f="title" maxlength="200"></td><td class="pr-1 pb-1"><input class="${INP}" style="min-width:130px" data-f="author" maxlength="150"></td><td class="pb-1"><input class="${INP}" style="min-width:110px" data-f="cat" list="semCats" maxlength="80"></td></tr>`;
  function addRows(n) { const tb = $('semAddRows'); if (!tb) return; for (let i = 0; i < n; i++) tb.insertAdjacentHTML('beforeend', rowHtml()); S.addRows += n; }
  function clearRows() { const tb = $('semAddRows'); if (tb) tb.innerHTML = ''; S.addRows = 0; addRows(5); const r = $('semAddResult'); if (r) r.innerHTML = ''; }
  function fillSeq() {
    const start = ($('semSeqStart').value || '').trim(), cnt = Math.min(200, Math.max(1, parseInt($('semSeqCount').value, 10) || 0));
    const s = enDigits(start); if (!/^\d+$/.test(s)) return warn('Start number must be digits only (e.g. 0501).');
    const w = s.length, v0 = parseInt(s, 10), tb = $('semAddRows');
    const rows = () => [...tb.querySelectorAll('tr')];
    while (rows().length < cnt) addRows(1);
    rows().slice(0, cnt).forEach((tr, i) => { tr.querySelector('[data-f="no"]').value = String(v0 + i).padStart(w, '0'); });
  }
  async function saveRows() {
    const items = [], seen = new Set();
    for (const tr of $('semAddRows').querySelectorAll('tr')) {
      const g = f => tr.querySelector(`[data-f="${f}"]`).value.trim();
      const o = { book_no: normNo(g('no')), title: g('title'), author: g('author'), category: g('cat') };
      if (!o.book_no && !o.title && !o.author && !o.category) continue;
      if (!o.book_no) return warn('Every filled row needs a book number.');
      if (seen.has(o.book_no)) return warn('Book number ' + o.book_no + ' appears twice in this list.');
      seen.add(o.book_no); items.push(o);
    }
    if (!items.length) return warn('Enter at least one book number.');
    const existing = new Set((S.books || []).map(b => b.book_no)), dup = items.filter(i => existing.has(i.book_no)).length;
    if (dup && !(await confirmAction('Some numbers already exist', `${dup} of ${items.length} book number(s) already exist. Their blank fields stay unchanged; filled fields will be updated.`, 'Continue', '#4f46e5'))) return;
    const btn = $('semSaveBtn'); if (btn) btn.disabled = true; busy(true);
    const r = await staffCall('sem_admin_add_books', { p_books: items });
    busy(false); if (btn) btn.disabled = false;
    if (!r.ok) return errMsg(r.message);
    showAddResult($('semAddResult'), r);
    await loadBooks(true); okMsg(`${r.inserted} added, ${r.updated} updated`);
    if (!r.skipped) { const tb = $('semAddRows'); tb.innerHTML = ''; S.addRows = 0; addRows(5); const ss = $('semSeqStart'); if (ss) ss.value = nextNo(); }
  }
  function showAddResult(el, r) {
    if (!el) return;
    el.innerHTML = `<div class="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 rounded-xl p-3 text-sm dark:text-white">✅ <b>${r.inserted}</b> added · <b>${r.updated}</b> updated · <b>${r.skipped}</b> skipped${(r.skipped_items || []).length ? `<br><span class="text-red-600 text-xs">Skipped (invalid number): ${esc(r.skipped_items.join(', '))}</span>` : ''}</div>`;
  }
  const KEYMAP = { bookno: 'book_no', no: 'book_no', number: 'book_no', id: 'book_no', serial: 'book_no', sl: 'book_no', title: 'title', name: 'title', bookname: 'title', booktitle: 'title', author: 'author', writer: 'author', category: 'category', subject: 'category', type: 'category' };
  function onFile(inp) {
    const f = inp.files && inp.files[0]; if (!f) return;
    if (typeof XLSX === 'undefined') return warn('Excel library not loaded. Check your internet connection.');
    const rd = new FileReader();
    rd.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
        const out = []; let noNumber = 0; const seen = new Set(); let dupInFile = 0;
        raw.forEach(row => {
          const o = { book_no: '', title: '', author: '', category: '' };
          Object.keys(row).forEach(k => { const m = KEYMAP[String(k).toLowerCase().replace(/[^a-z]/g, '')]; if (m && !o[m]) o[m] = String(row[k]).trim(); });
          o.book_no = normNo(o.book_no);
          if (!o.book_no) { if (o.title || o.author || o.category) noNumber++; return; }
          if (seen.has(o.book_no)) { dupInFile++; return; }
          seen.add(o.book_no); out.push(o);
        });
        S.upload = out;
        $('semUpPreview').innerHTML = out.length ? `<p class="text-sm dark:text-white mb-2"><b>${out.length}</b> book(s) ready${noNumber ? ` · <span class="text-amber-600">${noNumber} row(s) without a number will be ignored</span>` : ''}${dupInFile ? ` · <span class="text-amber-600">${dupInFile} repeated number(s) in the file ignored</span>` : ''}.</p>
          <div class="overflow-x-auto mb-2"><table class="text-xs dark:text-white w-full"><thead><tr class="text-left border-b"><th>Book No</th><th>Title</th><th>Author</th><th>Category</th></tr></thead><tbody>${out.slice(0, 8).map(o => `<tr class="border-b dark:border-gray-700"><td class="pr-2">${esc(o.book_no)}</td><td class="pr-2">${esc(o.title)}</td><td class="pr-2">${esc(o.author)}</td><td>${esc(o.category)}</td></tr>`).join('')}</tbody></table></div>
          <button id="semUpBtn" onclick="SEM.doUpload()" class="${BTN} bg-emerald-600">⬆️ Upload ${out.length} book(s)</button>`
          : '<p class="text-sm text-red-600">No valid rows found. Make sure the first row has a <b>book_no</b> column.</p>';
      } catch (err) { console.error(err); $('semUpPreview').innerHTML = '<p class="text-sm text-red-600">Could not read this file.</p>'; }
    };
    rd.readAsArrayBuffer(f);
  }
  async function doUpload() {
    const list = S.upload || []; if (!list.length) return;
    const btn = $('semUpBtn'); if (btn) btn.disabled = true; busy(true);
    const tot = { ok: true, inserted: 0, updated: 0, skipped: 0, skipped_items: [] };
    for (let i = 0; i < list.length; i += 500) {
      const r = await staffCall('sem_admin_add_books', { p_books: list.slice(i, i + 500) });
      if (!r.ok) { busy(false); if (btn) btn.disabled = false; showAddResult($('semUpPreview'), tot); return errMsg(r.message + (i ? ` (first ${i} books were saved)` : '')); }
      tot.inserted += r.inserted; tot.updated += r.updated; tot.skipped += r.skipped; tot.skipped_items.push(...(r.skipped_items || []));
    }
    busy(false); S.upload = null; showAddResult($('semUpPreview'), tot);
    await loadBooks(true); okMsg(`${tot.inserted} added, ${tot.updated} updated`);
  }
  function template() {
    exportXlsx('seminar_books_template', 'Books', ['book_no', 'title', 'author', 'category'], [['0501', 'Principles of Economics', 'N. Gregory Mankiw', 'Economics'], ['0502', '', '', '']]);
  }

  // ============================================================
  // REPORTS
  // ============================================================
  async function vReports(body) {
    await loadBooks();
    if (!alive('reports')) return;
    const kinds = [['unreturned', 'Not returned'], ['stock', 'Current stock'], ['year', 'Year-wise issues'], ['student', 'By student'], ['book', 'By book'], ['overdue', 'Overdue']];
    body.innerHTML = `<div class="flex gap-2 flex-wrap mb-4">${kinds.map(k => `<button data-k="${k[0]}" onclick="SEM.rep('${k[0]}')" class="tab-pill">${k[1]}</button>`).join('')}</div><div id="semRepBody"></div>`;
    rep(S.repKind || 'unreturned');
  }
  async function rep(kind) {
    S.repKind = kind; S.rep = null;
    document.querySelectorAll('#semBody [data-k]').forEach(b => b.classList.toggle('active', b.dataset.k === kind));
    const box = $('semRepBody'); if (!box) return;
    const live = () => alive('reports') && S.repKind === kind && $('semRepBody');
    if (kind === 'unreturned') {
      box.innerHTML = `<div class="flex flex-wrap gap-2 items-end mb-3"><div><label class="text-xs font-semibold dark:text-white">Not returned as of</label><input id="semUnDate" type="date" class="${INP}" max="${todayStr()}" value="${todayStr()}"></div><button onclick="SEM.runUnret()" class="${BTN} bg-indigo-600">Show</button><button onclick="document.getElementById('semUnDate').value=''+SEM.today(); SEM.runUnret()" class="${BTN} bg-gray-500">Today</button></div><p class="text-xs text-gray-500 dark:text-gray-400 mb-3">Pick any date (for example the day before the final exam or promotion). Then filter by year or session and download.</p><div id="semUnOut"></div>`;
      runUnret();
    }
    else if (kind === 'stock') { box.innerHTML = loadingHtml(); await vOverview(box); }
    else if (kind === 'overdue') { box.innerHTML = loadingHtml(); await vOverdue(box); }
    else if (kind === 'year') {
      box.innerHTML = `<div class="flex flex-wrap gap-2 items-end mb-3"><div><label class="text-xs font-semibold dark:text-white">From</label><input id="semFrom" type="date" class="${INP}"></div><div><label class="text-xs font-semibold dark:text-white">To</label><input id="semTo" type="date" class="${INP}"></div><button onclick="SEM.runYear()" class="${BTN} bg-indigo-600">Show</button></div><div id="semYearOut"></div>`;
      runYear();
    } else if (kind === 'student') {
      box.innerHTML = `<div class="flex gap-2 mb-2"><input id="semRsQ" class="${INP}" placeholder="Roll, registration no. or name" onkeydown="if(event.key==='Enter')SEM.repFindStudent()"><button onclick="SEM.repFindStudent()" class="${BTN} bg-indigo-600">Search</button></div><div id="semRsRes" class="space-y-2 mb-3"></div><div id="semRsOut"></div>`;
    } else if (kind === 'book') {
      box.innerHTML = `<input id="semRbQ" class="${INP} mb-2" placeholder="Type book number or title" oninput="SEM.repSuggestBook()"><div id="semRbSug" class="mb-3"></div><div id="semRbOut"></div>`;
    }
  }
  async function runYear() {
    const out = $('semYearOut'); if (!out) return; out.innerHTML = loadingHtml();
    const r = await staffCall('sem_report_year_wise', { p_from: ($('semFrom') || {}).value || null, p_to: ($('semTo') || {}).value || null });
    if (!$('semYearOut')) return;
    if (!r.ok) { out.innerHTML = `<p class="text-red-600 text-sm">${esc(r.message)}</p>`; return; }
    const items = r.items || [];
    setRep('seminar_year_wise', 'Seminar Library — Year-wise Issues', ['Year', 'Session', 'Books issued', 'Students', 'Returned', 'Still out'], items.map(i => [yl(i.year), i.session_year || '', i.books_issued, i.students, i.returned, i.still_out]));
    out.innerHTML = items.length ? exportBar() + `<div class="overflow-x-auto"><table class="w-full text-sm dark:text-white"><thead><tr class="text-left border-b dark:border-gray-600"><th class="py-2">Year</th><th>Session</th><th class="text-right">Books issued</th><th class="text-right">Students</th><th class="text-right">Returned</th><th class="text-right">Still out</th></tr></thead><tbody>${items.map(i => `<tr class="border-b dark:border-gray-700"><td class="py-2">${esc(yl(i.year))}</td><td>${esc(i.session_year || '-')}</td><td class="text-right num-display">${i.books_issued}</td><td class="text-right num-display">${i.students}</td><td class="text-right num-display">${i.returned}</td><td class="text-right num-display">${i.still_out}</td></tr>`).join('')}</tbody></table></div>` : empty('📑', 'No issues in this period.');
  }
  async function repFindStudent() {
    const q = ($('semRsQ') || {}).value || ''; if (!q.trim()) return warn('Enter a roll, registration number or name.');
    const r = await staffCall('sem_find_student', { p_query: q, p_session: null }); const box = $('semRsRes'); if (!box) return;
    if (!r.ok) { box.innerHTML = `<p class="text-sm text-red-600">${esc(r.message)}</p>`; return; }
    S.found = {}; (r.items || []).forEach(s => { S.found[s.student_id] = s; });
    box.innerHTML = (r.items || []).map(s => `<button onclick="SEM.repStudent('${esc(s.student_id)}')" class="w-full text-left bg-white dark:bg-gray-800 dark:text-white border dark:border-gray-600 rounded-xl p-2 text-sm"><b>${esc(s.name)}</b> · ${esc(yl(s.year))} · Session ${esc(s.session || s.session_year || '-')} · Roll ${esc(s.class_roll)}</button>`).join('') || '<p class="text-sm text-gray-500">No active student found.</p>';
  }
  async function repStudent(id) {
    const out = $('semRsOut'); if (!out) return; out.innerHTML = loadingHtml();
    const r = await staffCall('sem_report_student', { p_student_id: id }); if (!$('semRsOut')) return;
    if (!r.ok) { out.innerHTML = `<p class="text-red-600 text-sm">${esc(r.message)}</p>`; return; }
    const st = r.student, items = r.items || [];
    setRep('seminar_student_' + (st.class_roll || ''), `Seminar Library — ${st.name} (${yl(st.year)}, Roll ${st.class_roll})`, ['Book No', 'Title', 'Status', 'Issued', 'Due', 'Returned', 'Condition'],
      items.map(i => [i.book_no, i.title || '', L.loan[i.status] || i.status, fmtDate(i.issued_at), fmtDate(i.due_date), fmtDate(i.returned_at), L.cond[i.return_condition] || '']));
    out.innerHTML = `<p class="font-bold dark:text-white mb-2">${esc(st.name)} · ${esc(yl(st.year))} · Roll ${esc(st.class_roll)}</p>` + (items.length ? exportBar() + items.map(i => `<div class="${CARD} mb-2 text-sm dark:text-white"><b>${esc(i.book_no)}</b> — ${esc(i.title || '(no title)')} ${badge(i.status, L.loan[i.status] || i.status)}<br><span class="text-xs text-gray-500 dark:text-gray-400">Issued ${esc(fmtDate(i.issued_at))} · due ${esc(fmtDate(i.due_date))}${i.returned_at ? ' · returned ' + esc(fmtDate(i.returned_at)) + ' (' + esc(L.cond[i.return_condition] || '') + ')' : ''}</span></div>`).join('') : empty('📖', 'This student has not borrowed any book.'));
  }
  function repSuggestBook() {
    const q = (($('semRbQ') || {}).value || '').trim(), box = $('semRbSug'); if (!box) return; if (!q) { box.innerHTML = ''; return; }
    const n = normNo(q), low = q.toLowerCase();
    box.innerHTML = (S.books || []).filter(b => b.book_no.includes(n) || (b.title || '').toLowerCase().includes(low)).slice(0, 8).map(b => `<button onclick="SEM.repBook('${esc(b.id)}')" class="w-full text-left bg-white dark:bg-gray-800 dark:text-white border dark:border-gray-600 rounded-lg px-3 py-2 mb-1 text-sm"><b>${esc(b.book_no)}</b> — ${esc(b.title || '(no title)')}</button>`).join('') || '<p class="text-xs text-gray-500">No matching book.</p>';
  }
  async function repBook(id) {
    const out = $('semRbOut'); if (!out) return; $('semRbSug').innerHTML = ''; out.innerHTML = loadingHtml();
    const r = await staffCall('sem_report_book', { p_book_id: id }); if (!$('semRbOut')) return;
    if (!r.ok) { out.innerHTML = `<p class="text-red-600 text-sm">${esc(r.message)}</p>`; return; }
    const b = r.book, loans = r.loans || [];
    setRep('seminar_book_' + b.book_no, `Seminar Library — Book ${b.book_no} ${b.title || ''}`, ['Student', 'Year', 'Roll', 'Status', 'Issued', 'Due', 'Returned', 'Condition'],
      loans.map(l => [l.student_name, yl(l.year), l.class_roll, L.loan[l.status] || l.status, fmtDate(l.issued_at), fmtDate(l.due_date), fmtDate(l.returned_at), L.cond[l.return_condition] || '']));
    out.innerHTML = `<p class="font-bold dark:text-white mb-1">${esc(b.book_no)} — ${esc(b.title || '(no title)')} ${badge(b.status, L.book[b.status] || b.status)}</p><p class="text-xs text-gray-500 mb-2">Issued ${loans.filter(l => l.issued_at).length} time(s)</p>` + (loans.length ? exportBar() + loans.map(l => `<div class="${CARD} mb-2 text-sm dark:text-white">${esc(l.student_name)} · ${esc(yl(l.year))} · Roll ${esc(l.class_roll)} ${badge(l.status, L.loan[l.status] || l.status)}<br><span class="text-xs text-gray-500 dark:text-gray-400">Issued ${esc(fmtDate(l.issued_at))} · due ${esc(fmtDate(l.due_date))}${l.returned_at ? ' · returned ' + esc(fmtDate(l.returned_at)) : ''}</span></div>`).join('') : empty('📖', 'This book has never been issued.'));
  }


  // ============================================================
  // REGISTRATIONS (staff): approve / reject / bulk / edit
  // ============================================================
  const R = { status: 'pending', q: '', items: [], sel: new Set(), timer: null };
  async function vRegs(body) {
    body.innerHTML = `
      <div class="${CARD} mb-3"><p class="font-bold dark:text-white mb-1">Register a student at the desk</p>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">For a student who is present with you: search, enter the mobile number, and the registration is approved immediately.</p>
        <div class="flex gap-2"><input id="semRgQ" class="${INP}" placeholder="Roll, registration no. or name" onkeydown="if(event.key==='Enter')SEM.rgFind()"><button onclick="SEM.rgFind()" class="${BTN} bg-indigo-600">Search</button></div>
        <div id="semRgRes" class="mt-2 space-y-2"></div></div>
      <div class="flex flex-wrap gap-2 mb-2">${[['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']].map(x => `<button data-st="${x[0]}" onclick="SEM.rgStatus('${x[0]}')" class="tab-pill ${R.status === x[0] ? 'active' : ''}">${x[1]}</button>`).join('')}</div>
      <input id="semRgSearch" class="${INP} mb-2" placeholder="Search name, roll or mobile" value="${esc(R.q)}" oninput="SEM.rgSearch()">
      <div id="semRgBulk"></div><div id="semRgList">${loadingHtml()}</div>`;
    await rgLoad();
  }
  async function rgLoad() {
    const r = await staffCall('sem_reg_list', { p_status: R.status, p_query: R.q || null });
    if (!alive('registrations')) return;
    const box = $('semRgList'); if (!box) return;
    if (!r.ok) { box.innerHTML = errHtml(r.message); return; }
    R.items = r.items || []; R.sel = new Set(); rgRender();
    if (R.status === 'pending') { const b = document.querySelector('#semNav [data-t="registrations"]'); if (b) b.textContent = '📝 Registrations' + (R.items.length && !R.q ? ' (' + R.items.length + ')' : ''); }
  }
  function rgStatus(st) { R.status = st; document.querySelectorAll('#semBody [data-st]').forEach(b => b.classList.toggle('active', b.dataset.st === st)); const l = $('semRgList'); if (l) l.innerHTML = loadingHtml(); rgLoad(); }
  function rgSearch() { clearTimeout(R.timer); R.timer = setTimeout(() => { R.q = (($('semRgSearch') || {}).value || '').trim(); rgLoad(); }, 350); }
  function rgRender() {
    const box = $('semRgList'), bulk = $('semRgBulk'); if (!box) return;
    const pend = R.items.filter(i => i.status === 'pending');
    if (bulk) bulk.innerHTML = pend.length ? `<div class="flex flex-wrap items-center gap-2 mb-2"><button onclick="SEM.rgSelAll()" class="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-600 dark:text-white text-xs font-bold">Select all pending (${pend.length})</button><button onclick="SEM.rgBulk()" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">✅ Approve selected (<span id="semRgSelN">${R.sel.size}</span>)</button></div>` : '';
    box.innerHTML = R.items.length ? R.items.map(i => `<div class="${CARD} mb-2">
      <div class="flex justify-between items-start gap-2 flex-wrap">
        <div class="flex gap-2 min-w-0">${i.status === 'pending' ? `<input type="checkbox" class="mt-1" ${R.sel.has(i.reg_id) ? 'checked' : ''} onchange="SEM.rgTick('${esc(i.reg_id)}', this.checked)">` : ''}
          <div class="min-w-0"><p class="font-bold dark:text-white">${esc(i.student_name)} ${badge(i.status === 'pending' ? 'requested' : i.status, i.status === 'pending' ? 'Pending' : i.status === 'approved' ? 'Approved' : 'Rejected')}</p>
          <p class="text-xs text-gray-600 dark:text-gray-300">${esc(yl(i.year))}${i.session ? ' · Session ' + esc(i.session) : ''} · Roll ${esc(i.class_roll)}</p>
          <p class="text-xs text-gray-600 dark:text-gray-300">📱 <a href="tel:${esc(i.mobile)}" class="underline">${esc(i.mobile)}</a>${i.reg_no_entered ? ' · Reg no. entered: ' + esc(i.reg_no_entered) : ''}${i.reg_no_db ? ' · on record: ' + esc(i.reg_no_db) : ''}</p>
          <p class="text-xs text-gray-400">Submitted ${esc(fmtDate(i.submitted_at))}${i.decided_by ? ' · decided by ' + esc(i.decided_by) + ' on ' + esc(fmtDate(i.decided_at)) : ''}${i.source !== 'self' ? ' · ' + (i.source === 'legacy_import' ? 'imported' : 'added by staff') : ''}${i.note ? ' · note: ' + esc(i.note) : ''}</p></div></div>
        <div class="flex gap-1 flex-wrap">
          ${i.status !== 'approved' ? `<button onclick="SEM.rgDecide('${esc(i.reg_id)}', true)" class="bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold">Approve</button>` : ''}
          ${i.status !== 'rejected' ? `<button onclick="SEM.rgDecide('${esc(i.reg_id)}', false)" class="bg-red-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold">${i.status === 'approved' ? 'Revoke' : 'Reject'}</button>` : ''}
          <button onclick="SEM.rgEdit('${esc(i.reg_id)}')" class="bg-amber-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold">Edit</button>
          ${S.role === 'admin' ? `<button onclick="SEM.rgDelete('${esc(i.reg_id)}')" class="bg-gray-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold">Delete</button>` : ''}
        </div></div></div>`).join('') : empty('📝', R.status === 'pending' ? 'No registrations are waiting for approval.' : 'No registrations found.');
  }
  function rgTick(id, on) { on ? R.sel.add(id) : R.sel.delete(id); const n = $('semRgSelN'); if (n) n.textContent = R.sel.size; }
  function rgSelAll() { R.items.filter(i => i.status === 'pending').forEach(i => R.sel.add(i.reg_id)); rgRender(); }
  async function rgBulk() {
    if (!R.sel.size) return warn('Tick the registrations you want to approve.');
    if (!(await confirmAction('Approve ' + R.sel.size + ' registration(s)?', 'They will be able to request books.', 'Approve', '#059669'))) return;
    busy(true); const r = await staffCall('sem_reg_bulk_approve', { p_ids: [...R.sel] }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg(r.approved + ' approved'); rgLoad(); refreshRegBadge();
  }
  async function rgDecide(id, approve) {
    let note = null;
    if (!approve) {
      const res = await Swal.fire({ title: 'Reject this registration?', input: 'text', inputPlaceholder: 'Reason (shown to the student)', showCancelButton: true, confirmButtonText: 'Reject', confirmButtonColor: '#dc2626' });
      if (!res.isConfirmed) return; note = res.value || null;
    }
    busy(true); const r = await staffCall('sem_reg_decide', { p_reg_id: id, p_approve: approve, p_note: note }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg(approve ? 'Approved' : 'Rejected'); rgLoad(); refreshRegBadge();
  }
  async function rgEdit(id) {
    const i = R.items.find(x => x.reg_id === id); if (!i) return;
    const res = await Swal.fire({ title: 'Edit registration', html: `<input id="swM" class="swal2-input" type="tel" placeholder="Mobile (01XXXXXXXXX)" value="${esc(i.mobile)}"><input id="swR" class="swal2-input" placeholder="Registration no. (optional)" value="${esc(i.reg_no_entered || '')}" maxlength="30">`,
      showCancelButton: true, confirmButtonText: 'Save', preConfirm: () => { const m = normMobile($('swM').value); if (!m) { Swal.showValidationMessage('Enter a valid 11-digit mobile number'); return false; } return { m, r: $('swR').value }; } });
    if (!res.isConfirmed) return;
    busy(true); const r = await staffCall('sem_reg_update', { p_reg_id: id, p_mobile: res.value.m, p_reg_no: res.value.r || null }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Saved'); rgLoad();
  }
  async function rgDelete(id) {
    if (!(await confirmAction('Delete this registration?', 'The student will have to register again. Book history is not affected.', 'Delete', '#dc2626'))) return;
    busy(true); const r = await staffCall('sem_admin_reg_delete', { p_reg_id: id }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Registration deleted'); rgLoad(); refreshRegBadge();
  }
  async function rgFind() {
    const q = (($('semRgQ') || {}).value || '').trim(); if (!q) return warn('Enter a roll, registration number or name.');
    const box = $('semRgRes'); box.innerHTML = '<p class="text-sm text-gray-500">Searching…</p>';
    const r = await staffCall('sem_find_student', { p_query: q, p_session: null });
    if (!alive('registrations')) return;
    if (!r.ok) { box.innerHTML = `<p class="text-sm text-red-600">${esc(r.message)}</p>`; return; }
    S.found = {}; (r.items || []).forEach(s => { S.found[s.student_id] = s; });
    box.innerHTML = (r.items || []).map(s => `<div class="flex justify-between items-center gap-2 bg-white dark:bg-gray-800 rounded-xl p-2 border dark:border-gray-600"><div class="min-w-0 text-sm dark:text-white"><b>${esc(s.name)}</b><br><span class="text-xs text-gray-500">${esc(yl(s.year))} · Session ${esc(s.session || s.session_year || '-')} · Roll ${esc(s.class_roll)}</span></div><button onclick="SEM.rgAdd('${esc(s.student_id)}')" class="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold flex-shrink-0">Register</button></div>`).join('') || '<p class="text-sm text-gray-500">No active student found.</p>';
  }
  async function rgAdd(id) {
    const s = S.found[id]; if (!s) return;
    const res = await Swal.fire({ title: 'Register ' + s.name, html: `<input id="swM" class="swal2-input" type="tel" placeholder="Mobile (01XXXXXXXXX)"><input id="swR" class="swal2-input" placeholder="Registration no. (optional)" maxlength="30">`,
      showCancelButton: true, confirmButtonText: 'Register & approve', confirmButtonColor: '#059669', preConfirm: () => { const m = normMobile($('swM').value); if (!m) { Swal.showValidationMessage('Enter a valid 11-digit mobile number'); return false; } return { m, r: $('swR').value }; } });
    if (!res.isConfirmed) return;
    busy(true); const r = await staffCall('sem_reg_staff_add', { p_student_id: id, p_mobile: res.value.m, p_reg_no: res.value.r || null }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg(s.name + ' is registered and approved'); S.found = {}; $('semRgRes').innerHTML = ''; $('semRgQ').value = ''; rgLoad(); refreshRegBadge();
  }

  // ============================================================
  // ENTRIES: find any loan, then edit / remove / undo return
  // ============================================================
  const E = { items: [], timer: null };
  const isoDhaka = ts => { try { return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }); } catch (e) { return ''; } };
  async function vEntries(body) {
    body.innerHTML = `<p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Use this page to correct mistakes. ${S.role === 'admin' ? 'As Admin you can edit or remove any entry.' : 'You can remove or undo entries made in the last 48 hours; older ones need the Admin.'}</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3"><input id="semEnQ" class="${INP} sm:col-span-2" placeholder="Book number, title, student name or roll" oninput="SEM.enSearch()"><select id="semEnSt" class="${INP}" onchange="SEM.enLoad()"><option value="all">All statuses</option><option value="issued">Issued</option><option value="returned">Returned</option><option value="requested">Requested</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select></div>
      <div id="semEnList">${loadingHtml()}</div>`;
    await enLoad();
  }
  function enSearch() { clearTimeout(E.timer); E.timer = setTimeout(enLoad, 350); }
  async function enLoad() {
    const r = await staffCall('sem_loans_list', { p_q: (($('semEnQ') || {}).value || '').trim() || null, p_status: ($('semEnSt') || {}).value || 'all', p_limit: 100 });
    if (!alive('entries')) return;
    const box = $('semEnList'); if (!box) return;
    if (!r.ok) { box.innerHTML = errHtml(r.message); return; }
    E.items = r.items || [];
    box.innerHTML = E.items.length ? E.items.map(l => `<div class="${CARD} mb-2">
      <div class="flex justify-between items-start gap-2 flex-wrap"><div class="min-w-0">
        <p class="font-bold dark:text-white"><span class="num-display">${esc(l.book_no)}</span> — ${esc(l.title || '(no title)')} ${badge(l.status, L.loan[l.status] || l.status)}</p>
        <p class="text-sm dark:text-gray-200">${esc(l.student_name)} · ${esc(yl(l.year))}${l.session ? ' (' + esc(l.session) + ')' : ''} · Roll ${esc(l.class_roll)}${l.mobile ? ' · ' + esc(l.mobile) : ''}</p>
        <p class="text-xs text-gray-500 dark:text-gray-400">${l.issued_at ? 'Issued ' + esc(fmtDate(l.issued_at)) + ' · due ' + esc(fmtDate(l.due_date)) : 'Requested ' + esc(fmtDate(l.requested_at))}${l.returned_at ? ' · returned ' + esc(fmtDate(l.returned_at)) + ' (' + esc(L.cond[l.return_condition] || '') + ')' : ''}</p></div>
      <div class="flex gap-1 flex-wrap">${S.role === 'admin' && (l.status === 'issued' || l.status === 'returned') ? `<button onclick="SEM.enEdit('${esc(l.loan_id)}')" class="bg-amber-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold">Edit</button>` : ''}
        ${l.status === 'returned' ? `<button onclick="SEM.enUndo('${esc(l.loan_id)}')" class="bg-indigo-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold">Undo return</button>` : ''}
        <button onclick="SEM.enVoid('${esc(l.loan_id)}')" class="bg-red-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold">Remove</button></div></div></div>`).join('')
      : empty('🧾', 'No entries found.');
  }
  async function enEdit(id) {
    const l = E.items.find(x => x.loan_id === id); if (!l) return;
    const iss = isoDhaka(l.issued_at), ret = l.returned_at ? isoDhaka(l.returned_at) : '';
    const res = await Swal.fire({ title: 'Edit entry · ' + l.book_no, html: `<label style="font-size:12px">Mobile</label><input id="swM" class="swal2-input" type="tel" value="${esc(l.mobile || '')}" placeholder="01XXXXXXXXX">
      <label style="font-size:12px">Issue date</label><input id="swI" class="swal2-input" type="date" max="${todayStr()}" value="${iss}">
      <label style="font-size:12px">Due date</label><input id="swD" class="swal2-input" type="date" value="${esc(l.due_date || '')}">
      ${l.status === 'returned' ? `<label style="font-size:12px">Return date</label><input id="swR" class="swal2-input" type="date" max="${todayStr()}" value="${ret}">` : ''}`,
      showCancelButton: true, confirmButtonText: 'Save', preConfirm: () => {
        const m = $('swM').value.trim(), out = { m: null, i: null, d: null, r: null };
        if (m && m !== (l.mobile || '')) { const nm = normMobile(m); if (!nm) { Swal.showValidationMessage('Enter a valid 11-digit mobile number'); return false; } out.m = nm; }
        if ($('swI').value && $('swI').value !== iss) out.i = $('swI').value;
        if ($('swD').value && $('swD').value !== l.due_date) out.d = $('swD').value;
        if ($('swR') && $('swR').value && $('swR').value !== ret) out.r = $('swR').value;
        return out;
      } });
    if (!res.isConfirmed) return;
    const v = res.value; if (!v.m && !v.i && !v.d && !v.r) return warn('Nothing was changed.');
    busy(true); const r = await staffCall('sem_loan_update', { p_loan_id: id, p_mobile: v.m, p_issued_on: v.i, p_due_on: v.d, p_returned_on: v.r }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Entry updated'); S.books = null; enLoad();
  }
  async function enUndo(id) {
    if (!(await confirmAction('Undo this return?', 'The book will be marked as issued to the student again.', 'Undo return', '#4f46e5'))) return;
    busy(true); const r = await staffCall('sem_loan_undo_return', { p_loan_id: id }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Return undone'); S.books = null; enLoad();
  }
  async function enVoid(id) {
    const l = E.items.find(x => x.loan_id === id); if (!l) return;
    const res = await Swal.fire({ title: 'Remove this entry?', html: `<p style="font-size:13px;margin-bottom:6px"><b>${esc(l.book_no)}</b> · ${esc(l.student_name)} · ${esc(L.loan[l.status] || l.status)}</p><p style="font-size:12px;color:#777">${l.status === 'issued' ? 'The book will become available again.' : 'This deletes the record.'}</p>`,
      input: 'text', inputPlaceholder: 'Reason (required)', showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#dc2626',
      inputValidator: v => (!v || v.trim().length < 3) ? 'Enter a reason' : null });
    if (!res.isConfirmed) return;
    busy(true); const r = await staffCall('sem_loan_void', { p_loan_id: id, p_reason: res.value }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Entry removed'); S.books = null; enLoad();
  }
  async function deleteBook(id) {
    const b = (S.books || []).find(x => x.id === id); if (!b) return;
    if (!(await confirmAction('Delete book ' + b.book_no + '?', 'Only books that were never issued can be deleted. Otherwise mark them as Withdrawn.', 'Delete', '#dc2626'))) return;
    busy(true); const r = await staffCall('sem_admin_delete_book', { p_book_id: id }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Book deleted'); await loadBooks(true); filterBooks(false);
  }

  // ============================================================
  // IMPORT PAST RECORDS (admin): Excel → check → import
  // ============================================================
  const I = { items: [], name: '', checked: null };
  const IMP_KEYS = { session: 'session', classroll: 'class_roll', roll: 'class_roll', year: 'year', class: 'year', bookno: 'book_no', book: 'book_no', booknumber: 'book_no',
    mobile: 'mobile', phone: 'mobile', mobilenumber: 'mobile', issuedon: 'issued_on', issuedate: 'issued_on', issueddate: 'issued_on', issued: 'issued_on', dateofissue: 'issued_on', issue: 'issued_on',
    dueon: 'due_on', duedate: 'due_on', due: 'due_on', returnedon: 'returned_on', returndate: 'returned_on', returneddate: 'returned_on', returned: 'returned_on', dateofreturn: 'returned_on', condition: 'condition' };
  function normDate(v) {
    const t = enDigits(v).trim(); if (!t) return '';
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) { const [y, m, d] = t.split('-'); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }
    const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(t);   // day first (Bangladesh style)
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return t;
  }
  function impTemplate() {
    exportXlsx('seminar_past_records_template', 'Records', ['session', 'class_roll', 'year', 'book_no', 'mobile', 'issued_on', 'due_on', 'returned_on', 'condition'],
      [['2024-25', '224', '1st', '0125', '01712345678', '2026-03-10', '', '', ''], ['2023-24', '15', '', '0126', '01812345678', '2026-02-01', '2026-02-15', '2026-02-20', 'good']]);
  }
  function impFile(inp) {
    const f = inp.files && inp.files[0]; if (!f) return;
    if (typeof XLSX === 'undefined') return warn('Excel library not loaded. Check your internet connection.');
    const rd = new FileReader();
    rd.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
        const out = [];
        raw.forEach(row => {
          const o = { session: '', class_roll: '', year: '', book_no: '', mobile: '', issued_on: '', due_on: '', returned_on: '', condition: '' };
          Object.keys(row).forEach(k => { const m = IMP_KEYS[String(k).toLowerCase().replace(/[^a-z]/g, '')]; if (m && !o[m]) o[m] = String(row[k]).trim(); });
          if (!Object.values(o).some(v => v)) return;
          o.issued_on = normDate(o.issued_on); o.due_on = normDate(o.due_on); o.returned_on = normDate(o.returned_on);
          o.book_no = normNo(o.book_no); o.session = enDigits(o.session).replace(/\s+/g, '');
          o.class_roll = enDigits(o.class_roll).trim();
          out.push(o);
        });
        I.items = out; I.name = f.name; I.checked = null;
        $('semImpOut').innerHTML = out.length ? `<p class="text-sm dark:text-white mb-2"><b>${out.length}</b> row(s) read from <b>${esc(f.name)}</b>.</p><button onclick="SEM.impCheck()" class="${BTN} bg-indigo-600">🔍 Check records (nothing is saved yet)</button>`
          : '<p class="text-sm text-red-600">No rows found. Use the template: the first row must contain the column names.</p>';
      } catch (err) { console.error(err); $('semImpOut').innerHTML = '<p class="text-sm text-red-600">Could not read this file.</p>'; }
    };
    rd.readAsArrayBuffer(f);
  }
  async function impRun(dry) {
    const CH = 400, errs = []; let ok = 0, bad = 0;
    busy(true);
    for (let i = 0; i < I.items.length; i += CH) {
      const r = await staffCall('sem_admin_import_loans', { p_items: I.items.slice(i, i + CH), p_dry_run: dry });
      if (!r.ok) { busy(false); errMsg(r.message); return null; }
      ok += r.ok_count; bad += r.error_count;
      (r.results || []).filter(x => !x.ok).forEach(x => errs.push({ row: i + x.row + 1, message: x.message }));   // Excel row = data row + 1 (header)
    }
    busy(false);
    return { ok, bad, errs };
  }
  async function impCheck() {
    const res = await impRun(true); if (!res) return;
    I.checked = res;
    const box = $('semImpOut');
    box.innerHTML = `<div class="bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-xl p-3 text-sm dark:text-white">
      <p>✅ <b>${res.ok}</b> row(s) are ready to import · ${res.bad ? `<span class="text-red-600">⚠️ <b>${res.bad}</b> row(s) have problems and will be skipped</span>` : 'no problems found'}</p>
      ${res.errs.length ? `<div class="overflow-x-auto mt-2 max-h-56 overflow-y-auto"><table class="text-xs w-full"><thead><tr class="text-left border-b"><th class="pr-2">Excel row</th><th>Problem</th></tr></thead><tbody>${res.errs.slice(0, 100).map(e => `<tr class="border-b dark:border-gray-700"><td class="pr-2 num-display">${e.row}</td><td>${esc(e.message)}</td></tr>`).join('')}</tbody></table></div>
        <button onclick="SEM.impErrXlsx()" class="mt-2 text-xs bg-gray-600 text-white px-3 py-1.5 rounded-lg font-bold">⬇️ Download problem list</button>` : ''}
      <div class="flex gap-2 mt-3 flex-wrap">${res.ok ? `<button onclick="SEM.impGo()" class="${BTN} bg-emerald-600">⬆️ Import ${res.ok} valid row(s)</button>` : ''}<button onclick="SEM.impCheck()" class="${BTN} bg-gray-500">Check again</button></div>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">Rows with problems are skipped. Fix them in Excel and upload the file again: rows already imported are recognised and never duplicated.</p></div>`;
  }
  function impErrXlsx() { const c = I.checked; if (c) exportXlsx('seminar_import_problems', 'Problems', ['Excel row', 'Problem'], c.errs.map(e => [e.row, e.message])); }
  async function impGo() {
    const c = I.checked; if (!c || !c.ok) return;
    if (!(await confirmAction('Import ' + c.ok + ' record(s)?', 'Real issue dates are kept. Students are registered and approved automatically.', 'Import', '#059669'))) return;
    const res = await impRun(false); if (!res) return;
    S.books = null; I.items = []; I.checked = null;
    $('semImpOut').innerHTML = `<div class="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 rounded-xl p-3 text-sm dark:text-white">✅ <b>${res.ok}</b> record(s) imported${res.bad ? ` · <span class="text-amber-700">${res.bad} skipped (see "Check" for reasons)</span>` : ''}.</div>`;
    okMsg(res.ok + ' record(s) imported');
  }

  // ============================================================
  // REPORT: books NOT returned — as of any date, any year
  // ============================================================
  const U = { items: [], asof: '' };
  async function runUnret() {
    const out = $('semUnOut'); if (!out) return; out.innerHTML = loadingHtml();
    const d = ($('semUnDate') || {}).value || todayStr();
    const r = await staffCall('sem_report_unreturned', { p_as_of: d, p_year: null, p_session_year: null });
    if (!$('semUnOut')) return;
    if (!r.ok) { out.innerHTML = `<p class="text-red-600 text-sm">${esc(r.message)}</p>`; return; }
    U.items = r.items || []; U.asof = r.as_of;
    const years = [...new Set(U.items.map(i => i.year).filter(Boolean))].sort(), sess = [...new Set(U.items.map(i => i.session_year).filter(v => v != null))].sort((a, b) => b - a);
    out.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3"><select id="semUnYear" class="${INP}" onchange="SEM.renderUnret()"><option value="">All years</option>${years.map(y => `<option value="${esc(y)}">${esc(yl(y))}</option>`).join('')}</select>
      <select id="semUnSess" class="${INP}" onchange="SEM.renderUnret()"><option value="">All sessions</option>${sess.map(y => `<option value="${y}">${y}</option>`).join('')}</select>
      <input id="semUnQ" class="${INP} col-span-2" placeholder="Search name, roll or book" oninput="SEM.renderUnret()"></div><div id="semUnList"></div>`;
    renderUnret();
  }
  function renderUnret() {
    const y = ($('semUnYear') || {}).value, ss = ($('semUnSess') || {}).value, q = (($('semUnQ') || {}).value || '').trim().toLowerCase(), n = normNo(q);
    const list = U.items.filter(i => (!y || i.year === y) && (!ss || String(i.session_year) === ss) && (!q || (i.student_name || '').toLowerCase().includes(q) || String(i.class_roll).toLowerCase() === q || i.book_no.includes(n) || (i.title || '').toLowerCase().includes(q)));
    const studs = new Set(list.map(i => i.student_id)).size;
    setRep('seminar_not_returned_' + U.asof, 'Seminar Library — Books not returned as of ' + fmtDate(U.asof),
      ['Year', 'Session', 'Roll', 'Student', 'Mobile', 'Book No', 'Title', 'Issued', 'Due', 'Days late'],
      list.map(i => [yl(i.year), i.session_year || i.session || '', i.class_roll, i.student_name, i.mobile || '', i.book_no, i.title || '', fmtDate(i.issued_at), fmtDate(i.due_date), i.days_late]));
    const box = $('semUnList'); if (!box) return;
    box.innerHTML = `<div class="flex justify-between items-center flex-wrap gap-2 mb-2"><p class="font-bold dark:text-white">${list.length} book(s) · ${studs} student(s) <span class="text-xs font-normal text-gray-500">as of ${esc(fmtDate(U.asof))}</span></p>${list.length ? exportBar() : ''}</div>` + (list.length ? list.map(i => `<div class="${CARD} mb-2 ${i.days_late > 0 ? 'border-l-4 border-red-400' : ''}"><div class="flex justify-between items-start gap-2 flex-wrap"><div class="min-w-0">
      <p class="font-bold dark:text-white">${esc(i.student_name)} <span class="text-xs font-normal text-gray-500">${esc(yl(i.year))} · ${esc(i.session_year || i.session || '')} · Roll ${esc(i.class_roll)}</span></p>
      <p class="text-sm dark:text-gray-200"><b>${esc(i.book_no)}</b> — ${esc(i.title || '(no title)')}</p>
      <p class="text-xs text-gray-500 dark:text-gray-400">Issued ${esc(fmtDate(i.issued_at))} · due ${esc(fmtDate(i.due_date))}${i.days_late > 0 ? ` · <b class="text-red-600">${i.days_late} day(s) late</b>` : ''}</p></div>
      <div class="flex gap-2">${i.mobile ? `<a href="tel:${esc(i.mobile)}" class="bg-blue-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold">📞</a>` : ''}${waLink({ mobile: i.mobile, student_name: i.student_name, book_no: i.book_no, title: i.title, due_date: i.due_date }) ? `<a href="${waLink({ mobile: i.mobile, student_name: i.student_name, book_no: i.book_no, title: i.title, due_date: i.due_date })}" target="_blank" rel="noopener" class="bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold">💬</a>` : ''}</div></div></div>`).join('') : empty('🎉', 'No unreturned books for this selection.'));
  }

  // ============================================================
  // STAFF + RULES (admin)
  // ============================================================
  async function vStaff(body) {
    const r = await staffCall('sem_admin_staff_list');
    if (!alive('staff')) return;
    if (!r.ok) { body.innerHTML = errHtml(r.message); return; }
    S.staff = r.items || [];
    body.innerHTML = `<p class="text-sm text-gray-600 dark:text-gray-300 mb-3">Teachers marked below can issue and receive books and see Seminar reports. Admin always has access. A teacher sees the Seminar tab from their next login.</p>
      <div class="space-y-2 max-w-2xl">${S.staff.map(t => `<div class="${CARD} flex justify-between items-center gap-2"><div><p class="font-semibold dark:text-white">${esc(t.name)}</p>${t.is_admin ? '<p class="text-xs text-gray-500">Admin — always allowed</p>' : ''}</div>
      ${t.is_admin ? '<span class="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Admin</span>' : `<label class="flex items-center gap-2 text-sm dark:text-white"><input type="checkbox" ${t.is_staff ? 'checked' : ''} onchange="SEM.setStaff('${esc(t.teacher_id)}', this)"> Seminar staff</label>`}</div>`).join('')}</div>`;
  }
  async function setStaff(id, el) {
    const on = el.checked; el.disabled = true;
    const r = await staffCall('sem_admin_set_staff', { p_teacher_id: id, p_on: on });
    el.disabled = false;
    if (!r.ok) { el.checked = !on; return errMsg(r.message); }
    okMsg(on ? 'Teacher can now manage the Seminar' : 'Seminar access removed');
  }
  async function vSettings(body) {
    const s = await loadSettings(true);
    if (!alive('settings')) return;
    if (!s) { body.innerHTML = errHtml('Could not load the rules.'); return; }
    body.innerHTML = `<div class="max-w-md space-y-3">
      <div><label class="text-sm font-semibold dark:text-white">Maximum books per student</label><input id="semMax" type="number" min="1" max="20" class="${INP}" value="${s.max_books}"></div>
      <div><label class="text-sm font-semibold dark:text-white">Loan period (days)</label><input id="semDays" type="number" min="1" max="120" class="${INP}" value="${s.loan_days}"></div>
      <label class="flex items-center gap-2 text-sm dark:text-white"><input type="checkbox" id="semBlock" ${s.block_if_overdue ? 'checked' : ''}> Do not give new books while the student has an overdue book</label>
      <button onclick="SEM.saveSettings()" class="${BTN} bg-indigo-600 w-full">Save rules</button></div>`;
  }
  async function saveSettings() {
    busy(true);
    const r = await staffCall('sem_admin_set_settings', { p_max_books: parseInt($('semMax').value, 10), p_loan_days: parseInt($('semDays').value, 10), p_block_if_overdue: !!$('semBlock').checked });
    busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Rules saved'); await loadSettings(true);
  }

  // ============================================================
  // STUDENT VIEW (inside the student dashboard): registration + requests
  // ============================================================
  const ST = { books: [], my: null, reg: null };
  async function studentInit() {
    const host = $('studentContent'); if (!host || $('semStudentBox')) return;
    host.insertAdjacentHTML('beforeend', `<div id="semStudentBox" class="mt-8"><h3 class="font-bold text-lg mb-3 dark:text-white flex items-center gap-2"><span>📚</span> Seminar Library</h3><div id="semStBody">${loadingHtml()}</div></div>`);
    await studentRefresh();
  }
  function regCardHtml(reg) {
    const st = reg.status;
    if (st === 'approved') return '';
    if (st === 'pending') return `<div class="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 p-4 rounded-r-xl mb-3"><b class="text-amber-800 dark:text-amber-200">⏳ Registration submitted</b><p class="text-sm text-gray-700 dark:text-gray-200 mt-1">Your Seminar teacher will verify it soon. You can request books after approval.${reg.mobile ? ' Mobile: ' + esc(reg.mobile) : ''}</p></div>`;
    return `<div class="${CARD} mb-3">
      ${st === 'rejected' ? `<p class="text-sm text-red-600 font-semibold mb-2">❌ Your registration was not approved${reg.note ? ': ' + esc(trData(reg.note)) : ''}. Please correct your details and submit again.</p>` : '<p class="font-semibold dark:text-white mb-1">Register to borrow books</p><p class="text-xs text-gray-500 dark:text-gray-400 mb-2">One-time step. A teacher will verify your details and approve you.</p>'}
      <input id="semSRegMob" type="tel" inputmode="numeric" class="${INP} mb-2" placeholder="Your mobile number (01XXXXXXXXX) *" value="${esc(reg.mobile || '')}">
      <input id="semSRegNo" class="${INP} mb-2" placeholder="Registration number (optional — leave blank if you do not have one)" maxlength="30">
      <button onclick="SEM.sRegSubmit()" class="${BTN} bg-pink-700 w-full">Register</button></div>`;
  }
  async function studentRefresh() {
    let [my, bk, reg] = await Promise.all([studCall('sem_s_my'), studCall('sem_s_books'), studCall('sem_s_reg_get')]);
    const body = $('semStBody'); if (!body) return;
    // If the registration functions are not installed yet (older database), behave exactly like before: no registration step.
    if (my.ok && !reg.ok && reg.rpcError) reg = { ok: true, status: 'approved', legacy: true };
    if (!my.ok || !reg.ok) { body.innerHTML = `<p class="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-4 rounded-xl text-center">Seminar Library is not available right now.</p>`; return; }
    ST.my = my; ST.reg = reg; ST.books = bk.ok ? (bk.items || []) : [];
    const approved = reg.status === 'approved';
    const items = my.items || [];
    const overdue = items.filter(i => i.is_overdue);
    const active = items.filter(i => i.status === 'requested' || i.status === 'issued');
    const history = items.filter(i => !(i.status === 'requested' || i.status === 'issued')).slice(0, 15);
    const cats = [...new Set(ST.books.map(b => b.category).filter(Boolean))].sort();
    body.innerHTML = `
      ${overdue.length ? `<div class="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-r-xl mb-3"><b class="text-red-700 dark:text-red-300">🚨 Please return your overdue book${overdue.length > 1 ? 's' : ''}</b><p class="text-sm text-gray-700 dark:text-gray-200 mt-1">${overdue.map(o => `${esc(o.book_no)}${o.title ? ' — ' + esc(o.title) : ''} (${o.days_late} day${o.days_late > 1 ? 's' : ''} late)`).join('<br>')}</p></div>` : ''}
      ${regCardHtml(reg)}
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">You can hold up to <b>${my.max_books}</b> books for <b>${my.loan_days}</b> days.</p>
      <h4 class="font-semibold dark:text-white mb-2">My books</h4>
      ${active.length ? active.map(i => `<div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mb-2 flex justify-between items-center gap-2"><div class="min-w-0 dark:text-white"><p class="font-semibold text-sm">${esc(i.book_no)}${i.title ? ' — ' + esc(i.title) : ''} ${badge(i.status, L.loan[i.status])}</p><p class="text-xs text-gray-500 dark:text-gray-400">${i.status === 'issued' ? `Due ${esc(fmtDate(i.due_date))}${i.is_overdue ? ' · <b class="text-red-600">overdue</b>' : ''}` : `Requested ${esc(fmtDate(i.requested_at))} — waiting for the librarian`}</p></div>${i.status === 'requested' ? `<button onclick="SEM.sCancel('${esc(i.loan_id)}')" class="text-xs bg-red-100 text-red-600 px-2.5 py-1 rounded-lg font-bold">Cancel</button>` : ''}</div>`).join('') : '<p class="text-sm text-gray-400 mb-2">You have no active books or requests.</p>'}
      ${approved ? `<h4 class="font-semibold dark:text-white mt-4 mb-2">Request a book</h4>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2"><input id="semSQ" class="${INP} sm:col-span-2" placeholder="Search by title, author or category" oninput="SEM.sSearch()"><select id="semSCat" class="${INP}" onchange="SEM.sSearch()"><option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
      <div id="semSRes" class="space-y-2"><p class="text-xs text-gray-400">Type at least 2 letters or pick a category. ${ST.books.length} book(s) available.</p></div>` : ''}
      ${history.length ? `<details class="mt-4"><summary class="cursor-pointer text-sm font-semibold dark:text-white">History (${history.length})</summary><div class="mt-2 space-y-1">${history.map(i => `<div class="text-xs bg-gray-50 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-3 py-2">${esc(i.book_no)}${i.title ? ' — ' + esc(i.title) : ''} · ${esc(L.loan[i.status] || i.status)}${i.returned_at ? ' ' + esc(fmtDate(i.returned_at)) : ''}${i.status === 'rejected' && i.reject_reason ? ' · ' + esc(trData(i.reject_reason)) : ''}</div>`).join('')}</div></details>` : ''}`;
  }
  async function sRegSubmit() {
    const m = normMobile(($('semSRegMob') || {}).value); if (!m) return warn('Enter a valid 11-digit mobile number.');
    busy(true); const r = await studCall('sem_s_reg_submit', { p_mobile: m, p_reg_no: (($('semSRegNo') || {}).value || '').trim() || null }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Registration submitted. Wait for the teacher\'s approval.'); studentRefresh();
  }
  function sSearch() {
    const q = (($('semSQ') || {}).value || '').trim().toLowerCase(), cat = ($('semSCat') || {}).value, box = $('semSRes'); if (!box) return;
    if (q.length < 2 && !cat) { box.innerHTML = `<p class="text-xs text-gray-400">Type at least 2 letters or pick a category. ${ST.books.length} book(s) available.</p>`; return; }
    const list = ST.books.filter(b => (!cat || b.category === cat) && (!q || (b.title || '').toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q) || (b.category || '').toLowerCase().includes(q)));
    box.innerHTML = list.slice(0, 30).map(b => `<div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 flex justify-between items-center gap-2"><div class="min-w-0 dark:text-white"><p class="font-semibold text-sm">${esc(b.title)}</p><p class="text-xs text-gray-500 dark:text-gray-400">${esc(b.author || '-')} · ${esc(b.category || 'No category')} · No. ${esc(b.book_no)}</p></div><button onclick="SEM.sRequest('${esc(b.id)}')" class="text-xs bg-pink-700 text-white px-3 py-1.5 rounded-lg font-bold flex-shrink-0">Request</button></div>`).join('') + (list.length > 30 ? `<p class="text-xs text-gray-400">Showing 30 of ${list.length}. Refine your search.</p>` : '') || '<p class="text-sm text-gray-400">No matching available book.</p>';
  }
  async function sRequest(id) {
    const b = ST.books.find(x => x.id === id); if (!b) return;
    if (!(await confirmAction('Request this book?', b.title, 'Send request', '#be185d'))) return;
    busy(true); const r = await studCall('sem_s_request', { p_book_id: id, p_mobile: null }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Request sent. Collect the book from the Seminar when approved.'); studentRefresh();
  }
  async function sCancel(id) {
    if (!(await confirmAction('Cancel this request?', '', 'Yes, cancel', '#dc2626'))) return;
    busy(true); const r = await studCall('sem_s_cancel', { p_loan_id: id }); busy(false);
    if (!r.ok) return errMsg(r.message);
    okMsg('Request cancelled'); studentRefresh();
  }

  // ============================================================
  // PUBLIC REGISTRATION PAGE (home → Seminar icon; no login)
  // ============================================================
  const P = { sessions: [], session: '', roll: '', cands: [], pick: 0 };
  function pubInit() {
    if ($('semRegSection')) return;
    const home = $('homeSection'); if (!home) return;
    home.insertAdjacentHTML('afterend', `<section id="semRegSection" class="hidden fade-in max-w-lg mx-auto mt-8 px-4 pb-20"><div class="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 sm:p-8"><div id="semPubBody"></div></div></section>`);
    const card = home.querySelector(':scope > .rounded-3xl');
    if (card) card.insertAdjacentHTML('afterend', `<button type="button" onclick="SEM.pubOpen()" class="mt-4 w-full bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-5 flex items-center gap-4 text-left btn-pop"><span class="text-4xl">📚</span><span><b class="block text-lg text-gray-800 dark:text-white">Seminar Library</b><span class="text-sm text-gray-500 dark:text-gray-400">New here? Register to borrow books</span></span></button>`);
    const fac = document.querySelector('nav button[onclick="showSection(\'teacherDirectory\')"]');
    if (fac) fac.insertAdjacentHTML('beforebegin', `<button onclick="SEM.pubOpen()" class="bg-purple-500 text-white px-3 py-2 rounded-lg btn-pop hidden md:block font-semibold">📚 Seminar</button>`);
    const mm = $('mobileMenu'), mf = mm && mm.querySelector('button[onclick^="showSection(\'teacherDirectory\')"]');
    if (mf) mf.insertAdjacentHTML('afterend', `<button onclick="SEM.pubOpen(); closeMobileMenu()" class="text-left py-2 border-b border-indigo-700 font-semibold">📚 Seminar Registration</button>`);
  }
  async function pubOpen() {
    showSection('semReg'); P.cands = []; P.pick = 0;
    pubFindView();
    if (!P.sessions.length) { const r = await call('sem_reg_sessions', {}); if (r.ok) { P.sessions = r.items || []; pubFindView(); } }
  }
  function pubFindView(msg) {
    const b = $('semPubBody'); if (!b) return;
    const opts = P.sessions.length ? `<select id="semPSess" class="${INP}">${P.sessions.map(x => `<option ${x === P.session ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : `<input id="semPSess" class="${INP}" placeholder="Session e.g. 2024-25" value="${esc(P.session)}">`;
    b.innerHTML = `<div class="text-center mb-5"><div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 mb-3 shadow-lg"><span class="text-3xl">📚</span></div>
      <h2 class="text-2xl font-extrabold text-gray-800 dark:text-white">Seminar Library Registration</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Register once, then request books from your student dashboard.</p></div>
      <label class="text-sm font-semibold dark:text-white">Session</label>${opts}
      <label class="text-sm font-semibold dark:text-white mt-3 block">Class roll</label>
      <input id="semPRoll" class="${INP}" inputmode="numeric" placeholder="Your class roll" value="${esc(P.roll)}" onkeydown="if(event.key==='Enter')SEM.pubFind()">
      ${msg ? `<p class="text-sm text-red-600 mt-2">${esc(msg)}</p>` : ''}
      <button onclick="SEM.pubFind()" class="${BTN} bg-pink-700 w-full mt-4">Find me</button>
      <button onclick="showSection('home')" class="w-full mt-2 text-sm text-gray-500 dark:text-gray-400 py-2">← Back to home</button>`;
  }
  async function pubFind() {
    P.session = (($('semPSess') || {}).value || '').trim(); P.roll = (($('semPRoll') || {}).value || '').trim();
    if (!P.session || !P.roll) return warn('Choose your session and enter your class roll.');
    busy(true); const r = await call('sem_reg_lookup', { p_session: P.session, p_roll: P.roll }); busy(false);
    if (!r.ok) return pubFindView(r.message);
    P.cands = r.candidates || []; P.pick = 0; pubFormView();
  }
  function pubPick(i) { P.pick = i; pubFormView(); }
  function pubFormView(done) {
    const b = $('semPubBody'); if (!b) return;
    const c = P.cands[P.pick] || {};
    if (done) {
      b.innerHTML = `<div class="text-center"><p class="text-5xl mb-3">✅</p><h2 class="text-xl font-extrabold dark:text-white mb-2">Registration submitted</h2>
        <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">Your Seminar teacher will verify your details. After approval, log in as a <b>Student</b> and open <b>Seminar Library</b> to request books.</p>
        <button onclick="showSection('studentLogin')" class="${BTN} bg-indigo-600 w-full mb-2">Go to Student Login</button><button onclick="showSection('home')" class="w-full text-sm text-gray-500 py-2">← Back to home</button></div>`; return;
    }
    const picker = P.cands.length > 1 ? `<p class="text-sm font-semibold dark:text-white mb-2">Several students have this roll. Which one are you?</p>${P.cands.map((x, i) => `<button onclick="SEM.pubPick(${i})" class="w-full text-left rounded-xl border-2 p-3 mb-2 ${i === P.pick ? 'border-pink-600 bg-pink-50 dark:bg-pink-900/20' : 'border-gray-200 dark:border-gray-600'} dark:text-white"><b>${esc(x.name)}</b><br><span class="text-xs text-gray-500">${esc(yl(x.year))} · Session ${esc(x.session)} · Roll ${esc(x.class_roll)}</span></button>`).join('')}` : `<div class="rounded-xl bg-gray-50 dark:bg-gray-700 p-3 mb-3 dark:text-white"><b>${esc(c.name)}</b><br><span class="text-xs text-gray-500 dark:text-gray-300">${esc(yl(c.year))} · Session ${esc(c.session)} · Roll ${esc(c.class_roll)}</span></div>`;
    const stateMsg = c.reg_status === 'approved' ? `<div class="bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-500 p-3 rounded-r-xl mb-3 text-sm dark:text-white">✅ You are already approved. Log in as a Student to request books.</div><button onclick="showSection('studentLogin')" class="${BTN} bg-indigo-600 w-full">Go to Student Login</button>`
      : `${c.reg_status === 'pending' ? '<div class="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 p-3 rounded-r-xl mb-3 text-sm dark:text-white">⏳ Already submitted and waiting for approval. You may update your mobile number below.</div>' : ''}${c.reg_status === 'rejected' ? '<div class="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-3 rounded-r-xl mb-3 text-sm dark:text-white">❌ Not approved earlier. Correct your details and submit again.</div>' : ''}
        <label class="text-sm font-semibold dark:text-white">Mobile number *</label><input id="semPMob" type="tel" inputmode="numeric" class="${INP}" placeholder="01XXXXXXXXX">
        <label class="text-sm font-semibold dark:text-white mt-3 block">Registration number <span class="font-normal text-gray-400">(optional — leave blank if you do not have one yet)</span></label><input id="semPReg" class="${INP}" maxlength="30">
        <button onclick="SEM.pubSubmit()" class="${BTN} bg-pink-700 w-full mt-4">Submit registration</button>`;
    b.innerHTML = `<h2 class="text-xl font-extrabold dark:text-white mb-3">Confirm your details</h2>${picker}${stateMsg}<button onclick="SEM.pubOpen()" class="w-full mt-2 text-sm text-gray-500 dark:text-gray-400 py-2">← Not you? Search again</button>`;
  }
  async function pubSubmit() {
    const c = P.cands[P.pick]; if (!c) return;
    const m = normMobile(($('semPMob') || {}).value); if (!m) return warn('Enter a valid 11-digit mobile number.');
    busy(true); const r = await call('sem_reg_submit', { p_session: P.session, p_roll: P.roll, p_year: c.year, p_mobile: m, p_reg_no: (($('semPReg') || {}).value || '').trim() || null }); busy(false);
    if (!r.ok) return errMsg(r.message);
    if (r.status === 'approved') { P.cands[P.pick].reg_status = 'approved'; return pubFormView(); }
    pubFormView(true);
  }

  // ============================================================
  // WIRING — wraps existing functions; the original always runs
  // ============================================================
  function addAdminPill() {
    const strip = $('adminTabs');
    if (strip && !strip.querySelector('[data-sem]')) strip.insertAdjacentHTML('beforeend', `<button data-sem="1" onclick="showAdminTab('seminar')" class="tab-pill">📚 Seminar</button>`);
  }
  function addTeacherPill() {
    const strip = $('teacherTabsDesktop');
    if (strip && !strip.querySelector('[data-sem]')) strip.insertAdjacentHTML('beforeend', `<button data-sem="1" onclick="showTeacherTab('seminar'); setActiveBottomNav('seminar')" class="tab-pill">📚 Seminar</button>`);
  }
  function removeTeacherPill() { document.querySelectorAll('#teacherTabsDesktop [data-sem]').forEach(b => b.remove()); }
  function resetState() { R.items = []; R.sel = new Set(); E.items = []; U.items = []; S.role = null; S.active = false; S.books = null; S.settings = null; S.sel = null; S.found = {}; S.issued = null; S.pending = null; S.rep = null; S.tab = 'overview'; }

  try {
    if (typeof showAdminTab === 'function') {
      const origA = showAdminTab;
      window.showAdminTab = async function (tab) {
        if (tab === 'seminar') {
          try {
            currentAdminTab = 'seminar';
            if (typeof markActiveTab === 'function') markActiveTab('adminTabs', 'seminar');
            if (S.role !== 'admin') resetState();
            open('admin'); return;
          } catch (e) { console.error('Seminar open failed', e); const el = $('adminContent'); if (el) el.innerHTML = '<p class="text-red-500 text-center py-8">Seminar could not load. Please refresh the page.</p>'; return; }
        }
        S.active = false;
        return origA.apply(this, arguments);
      };
    }
    if (typeof showTeacherTab === 'function') {
      const origT = showTeacherTab;
      window.showTeacherTab = async function (tab) {
        if (tab === 'seminar') {
          try {
            if (typeof pinTimerInterval !== 'undefined' && pinTimerInterval) { clearInterval(pinTimerInterval); pinTimerInterval = null; }
            if (typeof liveReportInterval !== 'undefined' && liveReportInterval) { clearInterval(liveReportInterval); liveReportInterval = null; }
            if (typeof flushPendingMarkSaves === 'function') flushPendingMarkSaves();
            if (typeof markActiveTab === 'function') markActiveTab('teacherTabsDesktop', 'seminar');
            if (typeof closeMoreMenu === 'function') closeMoreMenu();
            if (S.role !== 'teacher') resetState();
            open('teacher'); return;
          } catch (e) { console.error('Seminar open failed', e); const el = $('teacherContent'); if (el) el.innerHTML = '<p class="text-red-500 text-center py-8">Seminar could not load. Please refresh the page.</p>'; return; }
        }
        S.active = false;
        return origT.apply(this, arguments);
      };
    }
    if (typeof teacherLogin === 'function') {
      const origL = teacherLogin;
      window.teacherLogin = async function () {
        const out = await origL.apply(this, arguments);
        try {
          resetState(); removeTeacherPill();
          const t = typeof currentTeacher !== 'undefined' ? currentTeacher : null;
          if (t && t.token) {
            const mine = t.token;
            const r = await call('sem_settings_get', { p_token: mine });
            if (r.ok && r.is_staff && currentTeacher && currentTeacher.token === mine) addTeacherPill();
          }
        } catch (e) { console.warn('Seminar staff check failed', e); }
        return out;
      };
    }
    if (typeof loadStudentData === 'function') {
      const origS = loadStudentData;
      window.loadStudentData = async function () {
        const ok = await origS.apply(this, arguments);
        if (ok) { try { await studentInit(); } catch (e) { console.warn('Seminar (student) failed', e); } }
        return ok;
      };
    }
    if (typeof logout === 'function') {
      const origO = logout;
      window.logout = async function () { try { clearFrames(); resetState(); removeTeacherPill(); ST.books = []; ST.my = null; const sb = $('semStudentBox'); if (sb) sb.remove(); } catch (e) {} return origO.apply(this, arguments); };
    }
    addAdminPill();
    pubInit();
  } catch (e) { console.error('Seminar wiring failed', e); }

  // public handlers used by inline onclick attributes
  window.SEM = { go, tab: () => S.tab, exp, findStudent, pick, clearStudent, suggest, chooseBook, doIssue, issueReq, rejectReq, filterReturn, doReturn, extend,
    filterBooks, bookPageGo, editBook, bookStatus, history, addRows, clearRows, fillSeq, saveRows, onFile, doUpload, template, rep, runYear,
    repFindStudent, repStudent, repSuggestBook, repBook, setStaff, saveSettings, sSearch, sRequest, sCancel, sRegSubmit,
    rgFind, rgAdd, rgStatus, rgSearch, rgTick, rgSelAll, rgBulk, rgDecide, rgEdit, rgDelete, enSearch, enLoad, enEdit, enUndo, enVoid, deleteBook,
    impFile, impTemplate, impCheck, impGo, impErrXlsx, runUnret, renderUnret, today: todayStr, pubOpen, pubFind, pubPick, pubSubmit };
})();
