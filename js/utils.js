/* js/utils.js — Helper, Toast, Offline, Theme, PDF ফন্ট, Navigation */
// ============================================================
// NETWORK QUALITY
// ============================================================
function getNetworkQuality() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return 'unknown';
  if (conn.saveData) return 'slow';
  const et = conn.effectiveType;
  if (et === 'slow-2g' || et === '2g') return 'slow';
  if (et === '3g') return 'medium';
  return 'fast';
}

function updateNetworkBanner() {
  const banner = document.getElementById('networkBanner');
  if (!banner) return;
  const q = getNetworkQuality();
  if (q === 'slow' && navigator.onLine) {
    banner.classList.add('active');
  } else {
    banner.classList.remove('active');
  }
}

// ============================================================
// PWA
// ============================================================
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.classList.remove('hidden');
});

async function installPWA() {
  if (!deferredPrompt) {
    Swal.fire({
      title: '📲 Install App',
      html: `<div class="text-left text-sm"><p class="mb-2"><b>Android (Chrome):</b> Menu (⋮) → "Install app"</p><p class="mb-2"><b>iPhone (Safari):</b> Share (⬆️) → "Add to Home Screen"</p></div>`,
      icon: 'info', confirmButtonText: 'Got it', confirmButtonColor: '#4F46E5'
    });
    return;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    toastSuccess('🎉 App installed!');
    document.getElementById('installBtn').classList.add('hidden');
  }
  deferredPrompt = null;
}

window.addEventListener('appinstalled', () => {
  const btn = document.getElementById('installBtn');
  if (btn) btn.classList.add('hidden');
  toastSuccess('🎉 App installed successfully!');
});

// ============================================================
// HELPERS
// ============================================================
function banglaToEnglish(str) {
  const b = '০১২৩৪৫৬৭৮৯', e = '0123456789';
  return String(str).replace(/[০-৯]/g, (d) => e[b.indexOf(d)]);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function attrEsc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- Roll / Reg ordering (global; remembered on this device) ----
function getSortMode() { try { return localStorage.getItem('amcSortMode') === 'reg' ? 'reg' : 'roll'; } catch (e) { return 'roll'; } }
function _cmpRoll(ar, br) {
  ar = String(ar || '').trim(); br = String(br || '').trim();
  const aM = ar.match(/^([A-Za-z-]*)(\d+)/), bM = br.match(/^([A-Za-z-]*)(\d+)/);
  if (!aM || !bM) return ar.localeCompare(br);
  const aP = aM[1] || '', bP = bM[1] || '';
  if (!aP && bP) return -1;
  if (aP && !bP) return 1;
  if (aP === bP) return parseInt(aM[2], 10) - parseInt(bM[2], 10);
  return aP.localeCompare(bP);
}
function _cmpReg(ar, br) {
  ar = String(ar || '').trim(); br = String(br || '').trim();
  if (!ar && !br) return 0;
  if (!ar) return 1;   // no reg no. -> last
  if (!br) return -1;
  const ad = ar.replace(/\D/g, ''), bd = br.replace(/\D/g, '');
  if (ad && bd) return ad.length - bd.length || ad.localeCompare(bd);
  return ar.localeCompare(br);
}
function sortStudents(students) {
  const reg = getSortMode() === 'reg';
  const roll = x => x.class_roll || (x.students && x.students.class_roll) || '';
  const rg = x => x.reg_no || (x.students && x.students.reg_no) || '';
  return students.slice().sort((a, b) => reg ? (_cmpReg(rg(a), rg(b)) || _cmpRoll(roll(a), roll(b))) : _cmpRoll(roll(a), roll(b)));
}
function updateSortModeBtn() {
  const b = document.getElementById('sortModeBtn'); if (!b) return;
  b.textContent = getSortMode() === 'reg' ? '🔢 Reg' : '🔢 Roll';
  b.title = 'Order by ' + (getSortMode() === 'reg' ? 'Registration no.' : 'Class roll') + ' — tap to change';
}
function toggleSortMode() {
  try { localStorage.setItem('amcSortMode', getSortMode() === 'reg' ? 'roll' : 'reg'); } catch (e) {}
  updateSortModeBtn();
  let refreshed = false;
  if (typeof currentAttendanceData !== 'undefined' && currentAttendanceData && document.getElementById('attendanceReportArea')?.innerHTML.trim()) {
    currentAttendanceData.report = sortStudents(currentAttendanceData.report); renderAttendanceReport(); refreshed = true;
  }
  if (typeof renderTeacherAttendanceReport === 'function' && currentTeacherAttendanceData && document.getElementById('teacherAttendanceReportArea')?.innerHTML.trim()) { renderTeacherAttendanceReport(); refreshed = true; }
  if (typeof loadStudentList === 'function' && document.getElementById('studentListArea')?.innerHTML.trim()) { loadStudentList(); refreshed = true; }
  toastSuccess('Order: ' + (getSortMode() === 'reg' ? 'Registration no.' : 'Class roll') + (refreshed ? '' : ' (applies when you load a report/list)'));
}

function shortDevice(deviceId) {
  if (!deviceId) return '-';
  return deviceId.substring(0, 10);
}

function detectSuspicious(records) {
  const flags = [];
  const byDevice = {};
  records.forEach(r => {
    if (!r.device_id) return;
    if (!byDevice[r.device_id]) byDevice[r.device_id] = [];
    byDevice[r.device_id].push(r);
  });
  Object.entries(byDevice).forEach(([devId, recs]) => {
    const uniqueStudents = new Set(recs.map(r => r.student_id)).size;
    if (uniqueStudents >= 5) {
      flags.push({ deviceId: devId, type: 'many_students', count: uniqueStudents, message: `${uniqueStudents} students from same device` });
    }
    const sorted = recs.sort((a, b) => new Date(a.marked_at) - new Date(b.marked_at));
    for (let i = 0; i < sorted.length - 1; i++) {
      const diff = new Date(sorted[i+1].marked_at) - new Date(sorted[i].marked_at);
      if (diff < 60000 && sorted[i].student_id !== sorted[i+1].student_id) {
        flags.push({ deviceId: devId, type: 'rapid_fire', message: `2 attendances within 1 min (${new Date(sorted[i].marked_at).toLocaleTimeString('en-GB')})` });
        break;
      }
    }
  });
  return flags;
}

// ============================================================
// TOASTS / ALERTS
// ============================================================
const Toast = Swal.mixin({
  toast: true, position: window.innerWidth < 640 ? 'top' : 'top-end', showConfirmButton: false, timer: 2200, timerProgressBar: true,
  didOpen: (t) => { t.addEventListener('mouseenter', Swal.stopTimer); t.addEventListener('mouseleave', Swal.resumeTimer); }
});
function toastSuccess(msg) { Toast.fire({ icon: 'success', title: msg }); }
function toastError(msg) { Toast.fire({ icon: 'error', title: msg, timer: 4000 }); }
function toastWarning(msg) { Toast.fire({ icon: 'warning', title: msg, timer: 3500 }); }
function toastInfo(msg) { Toast.fire({ icon: 'info', title: msg }); }

async function confirmAction(title, text, confirmText = 'Yes, confirm', confirmColor = '#dc2626') {
  const res = await Swal.fire({
    title, text, icon: 'warning', showCancelButton: true,
    confirmButtonColor: confirmColor, cancelButtonColor: '#6b7280',
    confirmButtonText: confirmText, cancelButtonText: 'Cancel', reverseButtons: true
  });
  return res.isConfirmed;
}

function showGlobalLoader() { document.getElementById('globalLoader').classList.add('active'); }
function hideGlobalLoader() { document.getElementById('globalLoader').classList.remove('active'); }

function withTimeout(promise, ms) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Network slow — timeout')), ms))
  ]);
}

// ============================================================
// OFFLINE CACHE
// ============================================================
// old cache entries were keyed by session: drop them once
(function () {
  try {
    if (localStorage.getItem('amc_cache_ver') === 'sy1') return;
    Object.keys(localStorage).filter(k => k.startsWith('amc_students_') || k.startsWith('amc_last_session_')).forEach(k => localStorage.removeItem(k));
    localStorage.setItem('amc_cache_ver', 'sy1');
  } catch (e) { /* private mode */ }
})();
async function cacheStudentsFor(year, session_year, access = {}) {
  if (!navigator.onLine || !session_year || !year) return;
  try {
    let data, error;
    if (access.pin) {
      ({ data, error } = await db.rpc('pin_student_roster', { p_pin: access.pin }));
    } else if (access.teacherToken) {
      ({ data, error } = await db.rpc('t_teacher_student_roster', {
        p_token: access.teacherToken, p_year: year, p_session_year: session_year
      }));
    } else {
      return;
    }
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.message || 'Student roster access denied');
    localStorage.setItem('amc_students_' + year + '_' + session_year, JSON.stringify(data.students || []));
  } catch (e) { console.warn('student cache', e); }
}

async function cacheTeacherStudents() {
  if (!currentTeacher || !navigator.onLine) return;
  try {
    const { data } = await db.from('teacher_courses').select('year').eq('teacher_id', currentTeacher.id);
    for (const y of new Set((data || []).map(r => r.year))) {
      for (const sy of await getAvailableSessionYears(y)) await cacheStudentsFor(y, sy, { teacherToken: currentTeacher.token });
    }
  } catch (e) { console.warn('teacher student cache', e); }
}

// ============================================================
// OFFLINE QUEUE
// ============================================================
function updateOnlineStatus() {
  const badge = document.getElementById('offlineBadge');
  if (!navigator.onLine) {
    badge.classList.add('active', 'offline');
    badge.classList.remove('pending', 'slow');
    badge.innerHTML = '📴 Offline — attendance queued locally';
  } else {
    const pending = getOfflineQueue().length;
    if (pending > 0) {
      badge.classList.add('active', 'pending');
      badge.classList.remove('offline', 'slow');
      badge.innerHTML = `⏳ Syncing ${pending} attendances...`;
      syncOfflineQueue();
    } else if (getNetworkQuality() === 'slow') {
      badge.classList.add('active', 'slow');
      badge.classList.remove('offline', 'pending');
      badge.innerHTML = '🐌 Slow network — optimized mode';
    } else {
      badge.classList.remove('active', 'offline', 'pending', 'slow');
    }
  }
  updateNetworkBanner();
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

function getOfflineQueue() {
  try { const q = localStorage.getItem('amc_offline_queue'); return q ? JSON.parse(q) : []; } catch (e) { return []; }
}
function saveOfflineQueue(q) { localStorage.setItem('amc_offline_queue', JSON.stringify(q)); }
function queueAttendance(pin, roll, studentId, geo) {
  const q = getOfflineQueue();
  q.push({ pin, roll, studentId: studentId || null, deviceId, geo: geo || null, timestamp: Date.now() });
  saveOfflineQueue(q);
  updateOnlineStatus();
}

let isSyncingOffline = false;
async function syncOfflineQueue() {
  if (isSyncingOffline) return;
  const q = getOfflineQueue();
  if (!q.length) return;
  isSyncingOffline = true;
  try {
    const remaining = [];
    let synced = 0;
    for (const item of q) {
      try {
        // Keep legacy queue entries untouched for manual review; never sync via v2/v3.
        if (!item.studentId || typeof markAttendanceGeo !== 'function') {
          remaining.push(item);
          continue;
        }
        const { data, error } = await markAttendanceGeo(item.pin, item.studentId, item.deviceId, item.geo);
        if (error || !data?.ok) { remaining.push(item); } else { synced++; }
      } catch (e) { remaining.push(item); }
    }
    const added = getOfflineQueue().slice(q.length);
    saveOfflineQueue(remaining.concat(added));
    if (synced > 0) toastSuccess(`${synced} attendances synced`);
    updateOnlineStatus();
  } finally { isSyncingOffline = false; }
}

// ============================================================
// THEME
// ============================================================
function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  const next = isDark ? 'light' : 'dark';
  if (next === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  localStorage.setItem('amc_theme', next);
  updateThemeIcon();
  toastInfo(next === 'dark' ? '🌙 Dark mode' : '☀️ Light mode');
}
function updateThemeIcon() {
  const b = document.getElementById('themeToggleBtn');
  if (b) {
    const isDark = document.documentElement.classList.contains('dark');
    b.textContent = isDark ? '☀️' : '🌙';
    b.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    b.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  }
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if ((localStorage.getItem('amc_theme') || 'auto') === 'auto') {
    if (e.matches) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    updateThemeIcon();
  }
});

// ============================================================
// BANGLA FONT FOR PDF
// ============================================================
let banglaFontLoaded = false;
let banglaFontBase64 = null;
async function loadBanglaFont() {
  if (banglaFontLoaded) return banglaFontBase64;
  try {
    let r = await fetch('fonts/HindSiliguri-Regular.ttf').catch(() => null);
    if (!r || !r.ok) r = await fetch('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/hindsiliguri/HindSiliguri-Regular.ttf').catch(() => null);
    if (!r || !r.ok) return null;
    const b = await r.arrayBuffer();
    const bytes = new Uint8Array(b);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    banglaFontBase64 = btoa(bin);
    banglaFontLoaded = true;
    return banglaFontBase64;
  } catch (e) { return null; }
}
async function setupBanglaFont(doc) {
  const f = await loadBanglaFont();
  if (f) {
    try {
      doc.addFileToVFS('HindSiliguri-Regular.ttf', f);
      doc.addFont('HindSiliguri-Regular.ttf', 'HindSiliguri', 'normal');
      doc.setFont('HindSiliguri');
      return true;
    } catch (e) { return false; }
  }
  return false;
}

const sessionDatalist = `
  <datalist id="sessionOptions">
    <option value="2020-21"><option value="2021-22"><option value="2022-23"><option value="2023-24">
    <option value="2024-25"><option value="2025-26"><option value="2026-27"><option value="2027-28">
    <option value="2028-29"><option value="2029-30"><option value="2030-31">
  </datalist>`;

function showSection(id) {
  if (pinTimerInterval) { clearInterval(pinTimerInterval); pinTimerInterval = null; }
  closeMoreMenu();
  const bottomNav = document.getElementById('teacherBottomNav');
  if (bottomNav) bottomNav.classList.toggle('hidden', !(id === 'teacherDashboard' && currentTeacher));
  document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
  const t = document.getElementById(id + 'Section');
  if (t) { t.classList.remove('hidden'); t.classList.add('fade-in'); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (id === 'teacherDirectory') loadTeacherDirectory(true);
  if (id === 'notice') loadAllPublicNotices();
  if (id === 'home') { loadPublicNotices(); setTimeout(setupPinBoxes, 100); }
  if (id === 'adminDashboard') loadAdminDashboardStats();
}

function setActiveBottomNav(tabId) {
  document.querySelectorAll('#teacherBottomNav button').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('nav-' + tabId) || document.getElementById('nav-more');
  if (el) el.classList.add('active');
}

function toggleMoreMenu(e) {
  if (e) e.stopPropagation();
  const m = document.getElementById('teacherTabsDesktop');
  if (m) m.classList.toggle('mobile-open');
}
function closeMoreMenu() {
  const m = document.getElementById('teacherTabsDesktop');
  if (m) m.classList.remove('mobile-open');
}
document.addEventListener('click', (e) => {
  const m = document.getElementById('teacherTabsDesktop');
  if (m && m.classList.contains('mobile-open') && !m.contains(e.target)) closeMoreMenu();
});
