/* js/directory.js — শিক্ষক ডিরেক্টরি + পাবলিক নোটিশ */
// ============================================================
// TEACHER DIRECTORY (REDESIGNED)
// ============================================================
let teacherDirCache = null;
let teacherDirLoading = false;
try {
  const saved = localStorage.getItem('amc_teacher_dir_cache');
  if (saved) teacherDirCache = JSON.parse(saved);
} catch (e) { teacherDirCache = null; }

function isTeacherActive(t) {
  const v = t ? t.is_active : undefined;
  if (v === null || v === undefined || v === '') return true;
  if (v === false || v === 0) return false;
  const str = String(v).trim().toLowerCase();
  return !(str === 'false' || str === '0' || str === 'inactive' || str === 'no');
}

async function fetchTeacherDirectoryData(retries = 2) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await withTimeout(db.rpc('get_teacher_directory'), 12000);
      if (res.error) throw res.error;
      return res.data || [];
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr || new Error('Unknown error');
}

const TEACHER_GRADIENTS = [
  'from-indigo-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
  'from-violet-500 to-purple-600',
  'from-amber-500 to-yellow-600',
  'from-cyan-500 to-blue-600'
];

function getTeacherGradient(name) {
  let hash = 0;
  const str = String(name || '');
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return TEACHER_GRADIENTS[Math.abs(hash) % TEACHER_GRADIENTS.length];
}

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (!parts.length) return '👤';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function waNumber(m) {
  let d = banglaToEnglish(m || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('880')) return d;
  if (d.startsWith('0')) return '88' + d;
  return d.length === 10 ? '880' + d : d;
}

function renderTeacherDirectory() {
  const el = document.getElementById('directoryList');
  if (!el) return;
  const search = banglaToEnglish(document.getElementById('dirSearch')?.value || '').trim().toLowerCase();
  const list = (teacherDirCache || []).filter(t => {
    if (!isTeacherActive(t)) return false;
    if (!search) return true;
    return [t.name, t.designation, t.subject, t.bcs_batch, t.mobile, t.whatsapp, t.email].join(' ').toLowerCase().includes(search);
  });

  if (!list.length) {
    el.innerHTML = '<p class="text-center text-gray-500 col-span-full py-8">No teachers found</p>';
    return;
  }

  el.innerHTML = list.map(t => {
    const grad = getTeacherGradient(t.name);
    const wa = waNumber(t.whatsapp || t.mobile);
    const bcs = t.bcs_batch ? (/bcs/i.test(t.bcs_batch) ? t.bcs_batch : 'BCS ' + t.bcs_batch) : '';
    const bio = (t.biography || '').trim();
    const actions = [
      t.mobile ? `<a href="tel:${attrEsc(t.mobile)}" class="tbtn tbtn-call">📞 Call</a>` : '',
      wa ? `<a href="https://wa.me/${attrEsc(wa)}" target="_blank" rel="noopener" class="tbtn tbtn-wa">💬 WhatsApp</a>` : '',
      t.email ? `<a href="mailto:${attrEsc(t.email)}" class="tbtn tbtn-mail">✉️ Email</a>` : ''
    ].filter(Boolean);
    const hasInfo = t.mobile || t.whatsapp || t.email || bio;
    return `
    <div class="tcard fade-in">
      <div class="tcard-head bg-gradient-to-br ${grad}">
        <div class="tcard-avatar">${escapeHtml(getInitials(t.name))}</div>
        <div class="min-w-0">
          <h3 class="tcard-name">${escapeHtml(t.name)}</h3>
          <p class="tcard-desig">${escapeHtml(t.designation || 'Faculty Member')}</p>
        </div>
      </div>
      <div class="tcard-body">
        ${(bcs || t.subject) ? `<div>${bcs ? `<span class="tchip tchip-bcs">🏅 ${escapeHtml(bcs)}</span> ` : ''}${t.subject ? `<span class="tchip tchip-sub">📚 ${escapeHtml(t.subject)}</span>` : ''}</div>` : ''}
        ${t.mobile ? `<a href="tel:${attrEsc(t.mobile)}" class="tcard-row"><span class="ico">📞</span><span class="num-display">${escapeHtml(t.mobile)}</span></a>` : ''}
        ${(t.whatsapp && waNumber(t.whatsapp) !== waNumber(t.mobile)) ? `<a href="https://wa.me/${attrEsc(waNumber(t.whatsapp))}" target="_blank" rel="noopener" class="tcard-row"><span class="ico" style="background:#dcfce7">💬</span><span class="num-display">${escapeHtml(t.whatsapp)}</span></a>` : ''}
        ${t.email ? `<a href="mailto:${attrEsc(t.email)}" class="tcard-row"><span class="ico">✉️</span><span>${escapeHtml(t.email)}</span></a>` : ''}
        ${bio ? `<div><p class="tcard-bio ${bio.length > 140 ? 'clamp3' : ''}">${escapeHtml(bio)}</p>${bio.length > 140 ? `<button class="tcard-more" onclick="const p=this.previousElementSibling;p.classList.toggle('clamp3');this.textContent=p.classList.contains('clamp3')?'Read more ▾':'Show less ▴'">Read more ▾</button>` : ''}</div>` : ''}
        ${hasInfo ? '' : '<p class="tcard-empty">Profile details not added yet</p>'}
        ${actions.length ? `<div class="tcard-actions" style="grid-template-columns:repeat(${actions.length},1fr)">${actions.join('')}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function loadTeacherDirectory(forceReload = false) {
  const el = document.getElementById('directoryList');
  if (!el) return;

  if (teacherDirCache && !forceReload) { renderTeacherDirectory(); return; }
  if (teacherDirLoading) return;

  if (teacherDirCache) {
    renderTeacherDirectory();
  } else {
    el.innerHTML = Array.from({ length: 4 }).map(() => `
      <div class="teacher-card p-5">
        <div class="skeleton h-2 w-full mb-3 rounded"></div>
        <div class="flex items-start gap-3 mb-3">
          <div class="skeleton w-14 h-14 rounded-2xl"></div>
          <div class="flex-1">
            <div class="skeleton h-5 w-3/4 mb-2"></div>
            <div class="skeleton h-4 w-1/2"></div>
          </div>
        </div>
        <div class="skeleton h-4 w-full mb-2"></div>
        <div class="skeleton h-4 w-2/3"></div>
      </div>`).join('');
  }

  teacherDirLoading = true;
  try {
    const data = await fetchTeacherDirectoryData(2);
    teacherDirCache = data;
    try { localStorage.setItem('amc_teacher_dir_cache', JSON.stringify(data)); } catch (e) {}
    renderTeacherDirectory();
  } catch (err) {
    if (teacherDirCache) {
      renderTeacherDirectory();
      toastWarning('Slow network — showing cached list');
    } else {
      el.innerHTML = `
        <div class="col-span-full text-center py-8">
          <p class="text-red-500 mb-3">❌ Could not load directory</p>
          <p class="text-xs text-gray-400 mb-4">${escapeHtml(err.message || '')}</p>
          <button onclick="loadTeacherDirectory(true)" class="bg-indigo-600 text-white px-5 py-2 rounded-xl font-bold btn-pop">🔄 Retry</button>
        </div>`;
    }
  } finally {
    teacherDirLoading = false;
  }
}

// ============================================================
// PUBLIC NOTICES
// ============================================================
async function loadPublicNotices() {
  const el = document.getElementById('publicNoticeBoard');
  if (!el) return;
  const { data: notices } = await db.from('notices')
    .select('*').or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
    .order('created_at', { ascending: false }).limit(3);
  if (!notices || !notices.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-2xl shadow-lg p-4">
      <h3 class="font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2"><span>📢</span> Latest Notices</h3>
      <div class="space-y-2">
        ${notices.map(n => `
          <div class="${n.priority === 'urgent' ? 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500' : 'bg-pink-50 dark:bg-pink-900/20 border-l-4 border-pink-400'} p-3 rounded-r-xl">
            <b class="dark:text-white text-sm">${n.priority === 'urgent' ? '🚨 ' : ''}${escapeHtml(n.title)}</b>
            <p class="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">${escapeHtml(n.content)}</p>
          </div>
        `).join('')}
      </div>
      <button onclick="showSection('notice')" class="w-full mt-3 text-center text-pink-600 dark:text-pink-300 font-bold text-sm py-2 rounded-xl hover:bg-pink-50 dark:hover:bg-pink-900/20 btn-pop">View all notices →</button>
    </div>
  `;
}

async function loadAllPublicNotices() {
  const el = document.getElementById('publicNoticeFullList');
  if (!el) return;
  el.innerHTML = `<div class="flex flex-col items-center justify-center py-8 gap-3"><div class="w-9 h-9 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div><p class="text-gray-500 dark:text-gray-400 text-sm">Loading...</p></div>`;
  try {
    const res = await withTimeout(
      db.from('notices').select('*').or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
        .order('created_at', { ascending: false }).limit(200),
      12000
    );
    if (res.error) throw res.error;
    const list = res.data || [];
    if (!list.length) { el.innerHTML = '<p class="text-center text-gray-400 py-8">No notices available</p>'; return; }
    el.innerHTML = list.map(n => {
      const urgent = n.priority === 'urgent';
      const dt = n.created_at ? new Date(n.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      return `
        <div class="${urgent ? 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500' : 'bg-pink-50 dark:bg-pink-900/20 border-l-4 border-pink-400'} p-4 rounded-r-xl shadow-sm fade-in">
          <div class="flex justify-between items-start gap-2">
            <b class="dark:text-white text-base">${urgent ? '🚨 ' : ''}${escapeHtml(n.title)}</b>
            <span class="text-xs text-gray-400 dark:text-gray-500 num-display whitespace-nowrap">${escapeHtml(dt)}</span>
          </div>
          <p class="text-sm text-gray-700 dark:text-gray-300 mt-2 whitespace-pre-line">${escapeHtml(n.content)}</p>
        </div>`;
    }).join('');
  } catch (err) {
    el.innerHTML = `
      <div class="text-center py-8">
        <p class="text-red-500 mb-3">❌ Could not load notices</p>
        <button onclick="loadAllPublicNotices()" class="bg-pink-600 text-white px-5 py-2 rounded-xl font-bold btn-pop">🔄 Retry</button>
      </div>`;
  }
}
