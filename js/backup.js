/* js/backup.js — Backup / Restore */
// ============================================================
// BACKUP
// ============================================================
const BACKUP_TABLES = ['students', 'teachers', 'courses', 'courses_new', 'teacher_courses', 'attendance_sessions', 'attendance_records', 'exam_types', 'exam_schedules', 'exam_slots', 'exam_rooms', 'exam_invigilators', 'marks', 'notices'];

// একটি টেবিলের সব সারি ১০০০টি করে পাতা ধরে আনে — মোট সারির কোনো সীমা নেই
async function fetchTableFull(t) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    // attendance_sessions-এর pin কলাম সাধারণ ভাবে লুকানো, তাই অ্যাডমিন-ফাংশন দিয়ে আনা হয়
    const base = (t === 'attendance_sessions') ? db.rpc('admin_backup_attendance_sessions') : db.from(t).select('*');
    const { data, error } = await base.order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(t + ': ' + error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// সব টেবিল আনে এবং প্রতিটির সারি-সংখ্যা ডাটাবেসের আসল সংখ্যার সাথে মেলায়। না মিললে ব্যাকআপ বাতিল (আংশিক ফাইল তৈরি হয় না)
async function buildFullBackup() {
  const backup = { version: '2.0', timestamp: new Date().toISOString(), counts: {}, data: {} };
  for (const t of BACKUP_TABLES) {
    const rows = await fetchTableFull(t);
    const { count, error } = await db.from(t).select('id', { count: 'exact', head: true });
    if (error) throw new Error(t + ': ' + error.message);
    if (count !== null && count !== undefined && rows.length !== count) {
      throw new Error(`${t}: ডাটাবেসে ${count}টি সারি, কিন্তু ${rows.length}টি পাওয়া গেছে। ব্যাকআপ বাতিল — আবার চেষ্টা করুন।`);
    }
    backup.data[t] = rows;
    backup.counts[t] = rows.length;
  }
  return backup;
}

function saveBackupFile(backup, prefix) {
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().slice(0, 16).replace(':', '-');
  a.href = url; a.download = `${prefix}_${ts}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function backupCountsHtml(counts) {
  return Object.entries(counts).map(([t, n]) => `${escapeHtml(t)}: <b>${n}</b>`).join(' · ');
}

async function downloadFullBackup() {
  const status = document.getElementById('backupStatus');
  showGlobalLoader();
  try {
    const backup = await buildFullBackup();
    saveBackupFile(backup, 'amc_backup');
    if (status) status.innerHTML = `<p class="text-emerald-600 font-bold">✅ Backup সম্পূর্ণ</p><p class="text-xs text-gray-600 dark:text-gray-300 mt-1">${backupCountsHtml(backup.counts)}</p><p class="text-xs text-amber-600 mt-2">⚠️ ফাইলে শিক্ষকদের PIN-হ্যাশ ও শিক্ষার্থীদের ফোন নম্বর আছে। নিরাপদ জায়গায় রাখুন, কাউকে পাঠাবেন না।</p>`;
    toastSuccess('Backup downloaded');
  } catch (err) {
    if (status) status.innerHTML = `<p class="text-red-500">❌ ${escapeHtml(err.message)}</p>`;
    toastError(err.message);
  } finally { hideGlobalLoader(); }
}

// রিস্টোরের আগে ফাইল যাচাই — কিছু মুছার আগেই ত্রুটি ধরা পড়ে
function validateBackup(backup) {
  const problems = [];
  if (!backup || typeof backup !== 'object' || !backup.data || typeof backup.data !== 'object') return ['ফাইলটি AMC ব্যাকআপ নয়'];
  const need = ['students', 'courses', 'teacher_courses', 'attendance_sessions', 'attendance_records', 'marks'];
  need.forEach(t => { if (!Array.isArray(backup.data[t])) problems.push(`"${t}" টেবিল ফাইলে নেই`); });
  if (problems.length) return problems;
  const d = backup.data;
  if (backup.counts) {
    Object.keys(backup.counts).forEach(t => {
      if (Array.isArray(d[t]) && d[t].length !== backup.counts[t]) problems.push(`${t}: ফাইলে ${d[t].length}টি, কিন্তু লেখা আছে ${backup.counts[t]}টি — ফাইল অসম্পূর্ণ`);
    });
  } else {
    // পুরোনো ফরম্যাটের ব্যাকআপে ১০০০টির সীমায় ডেটা ছাঁটা পড়ত
    need.concat(['courses_new', 'notices']).forEach(t => {
      const n = (d[t] || []).length;
      if (n > 0 && n % 1000 === 0) problems.push(`${t}: ঠিক ${n}টি সারি — পুরোনো ব্যাকআপে ডেটা ছাঁটা পড়ে থাকতে পারে`);
    });
  }
  if (d.attendance_records.length > 0 && d.attendance_sessions.length === 0) problems.push('হাজিরা রেকর্ড আছে কিন্তু কোনো সেশন নেই — ফাইলটি অসম্পূর্ণ');
  const sessionIds = new Set(d.attendance_sessions.map(s => s.id));
  const orphan = d.attendance_records.filter(r => !sessionIds.has(r.session_id)).length;
  if (orphan > 0) problems.push(`${orphan}টি হাজিরা রেকর্ডের সেশন ফাইলে নেই`);
  return problems;
}

async function restoreFromBackup() {
  const file = document.getElementById('restoreFile')?.files[0];
  if (!file) return toastWarning('Select backup file');
  const status = document.getElementById('backupStatus');

  // ১) ফাইল যাচাই (এখনও কিছু মুছা হয়নি)
  let backup;
  try { backup = JSON.parse(await file.text()); } catch (e) { return toastError('ব্যাকআপ ফাইলটি পড়া যায়নি'); }
  const problems = validateBackup(backup);
  if (problems.length) {
    status.innerHTML = `<p class="text-red-600 font-bold">❌ রিস্টোর বাতিল — ফাইলে সমস্যা:</p><ul class="text-sm text-red-600 list-disc ml-5">${problems.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul><p class="text-xs text-gray-500 mt-2">আপনার বর্তমান ডেটায় কিছু বদলানো হয়নি।</p>`;
    return toastError('ব্যাকআপ ফাইলে সমস্যা — রিস্টোর বাতিল');
  }
  const summary = ['students', 'attendance_sessions', 'attendance_records', 'marks'].map(t => `${t}: ${backup.data[t].length}`).join(', ');
  const ok1 = await confirmAction('Restore?', `বর্তমান সব ডেটা মুছে এই ফাইলের ডেটা বসবে (${summary})। তার আগে স্বয়ংক্রিয় সেফটি-ব্যাকআপ নামবে।`, 'Continue', '#dc2626');
  if (!ok1) return;
  const ok2 = await confirmAction('Final?', 'নিশ্চিত?', 'Yes, Restore', '#dc2626');
  if (!ok2) return;

  showGlobalLoader();
  try {
    // ২) বর্তমান ডেটার সেফটি-ব্যাকআপ — ডাউনলোড না হলে রিস্টোর শুরুই হয় না
    status.innerHTML = '<p class="text-gray-500">⏳ বর্তমান ডেটার সেফটি-ব্যাকআপ নেওয়া হচ্ছে...</p>';
    const safety = await buildFullBackup();
    saveBackupFile(safety, 'amc_SAFETY_before_restore');

    // ৩) মুছা (কোনো ধাপে ব্যর্থ হলে সাথে সাথে থামে)
    status.innerHTML = '<p class="text-gray-500">⏳ পুরোনো ডেটা সরানো হচ্ছে...</p>';
    const delOrder = ['attendance_records', 'marks', 'exam_invigilators', 'exam_rooms', 'exam_slots', 'exam_schedules', 'exam_types', 'attendance_sessions', 'teacher_courses', 'courses', 'courses_new', 'students', 'notices'];
    for (const t of delOrder) {
      if (backup.data[t] === undefined && !(['exam_invigilators', 'exam_rooms', 'exam_slots', 'exam_schedules'].includes(t) && backup.data.exam_types !== undefined)) continue;
      const delQ = db.from(t).delete();
      const { error: delErr } = (t === 'courses_new')
        ? await delQ.neq('course_code', '__none__')
        : await delQ.neq('id', '00000000-0000-0000-0000-000000000000');
      if (delErr) throw new Error(`${t} মুছতে ব্যর্থ: ${delErr.message}`);
    }

    // ৪) বসানো — ৫০০টি করে। শিক্ষকদের তথ্য এখানে বদলানো হয় না (আলাদাভাবে পরিচালিত)
    const insOrder = ['students', 'courses', 'courses_new', 'teacher_courses', 'notices', 'exam_types', 'exam_schedules', 'exam_slots', 'exam_rooms', 'exam_invigilators', 'attendance_sessions', 'attendance_records', 'marks'];
    for (const t of insOrder) {
      const rows = backup.data[t];
      if (!rows || !rows.length) continue;
      status.innerHTML = `<p class="text-gray-500">⏳ ${escapeHtml(t)} বসানো হচ্ছে (${rows.length})...</p>`;
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db.from(t).insert(rows.slice(i, i + 500));
        if (error) throw new Error(`${t} বসাতে ব্যর্থ: ${error.message}`);
      }
    }

    // ৫) যাচাই — প্রতিটি টেবিলের সারি-সংখ্যা মেলানো
    const mismatches = [];
    for (const t of insOrder) {
      if (!Array.isArray(backup.data[t])) continue;
      const { count, error } = await db.from(t).select('id', { count: 'exact', head: true });
      if (error) { mismatches.push(`${t}: যাচাই করা যায়নি`); continue; }
      if (count !== backup.data[t].length) mismatches.push(`${t}: ফাইলে ${backup.data[t].length}, ডাটাবেসে ${count}`);
    }
    if (mismatches.length) throw new Error('রিস্টোর শেষে সংখ্যা মেলেনি: ' + mismatches.join('; '));

    status.innerHTML = '<p class="text-emerald-600 font-bold">✅ Restore সম্পূর্ণ ও যাচাই করা হয়েছে</p><p class="text-xs text-gray-500 mt-1">শিক্ষকদের তথ্য আগের মতোই আছে (রিস্টোরে বদলায় না)।</p>';
    toastSuccess('Restore successful');
  } catch (err) {
    status.innerHTML = `<p class="text-red-600 font-bold">❌ রিস্টোর থেমে গেছে: ${escapeHtml(err.message)}</p><p class="text-xs text-gray-600 dark:text-gray-300 mt-2">ডেটা অসম্পূর্ণ থাকতে পারে। এইমাত্র নামা <b>amc_SAFETY_before_restore_...json</b> ফাইলটি সযত্নে রাখুন এবং আমাকে জানান। আবার রিস্টোর চালাবেন না।</p>`;
    toastError(err.message);
  } finally { hideGlobalLoader(); }
}
