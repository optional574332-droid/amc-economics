/* js/attendance.js — স্টুডেন্টের PIN দিয়ে হাজিরা */
// ============================================================
// OTP PIN INPUT
// ============================================================
let pinSubmitTimer = null;
let pinSubmitting = false;

function schedulePinSubmit(delay = 450) {
  if (pinSubmitTimer) clearTimeout(pinSubmitTimer);
  pinSubmitTimer = setTimeout(() => { pinSubmitTimer = null; submitPin(); }, delay);
}

function setupPinBoxes() {
  const boxes = document.querySelectorAll('.pin-box');
  if (!boxes.length) return;
  boxes.forEach((box, idx) => {
    // Remove old listeners by cloning
    const newBox = box.cloneNode(true);
    box.parentNode.replaceChild(newBox, box);
  });
  const fresh = document.querySelectorAll('.pin-box');
  fresh.forEach((box, idx) => {
    box.addEventListener('input', (e) => {
      const val = banglaToEnglish(e.target.value).replace(/\D/g, '');
      if (val.length > 1) {
        // Multiple digits (paste)
        for (let i = 0; i < val.length && idx + i < fresh.length; i++) {
          fresh[idx + i].value = val[i];
          fresh[idx + i].classList.add('filled');
        }
        const nextEmpty = Array.from(fresh).findIndex(b => !b.value);
        if (nextEmpty >= 0) fresh[nextEmpty].focus();
        else { fresh[fresh.length - 1].focus(); schedulePinSubmit(); }
        return;
      }
      e.target.value = val.slice(-1);
      if (val) {
        box.classList.add('filled');
        if (idx < fresh.length - 1) {
          fresh[idx + 1].focus();
        } else {
          schedulePinSubmit();
        }
      } else {
        box.classList.remove('filled');
      }
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && idx > 0) {
        fresh[idx - 1].focus();
        fresh[idx - 1].value = '';
        fresh[idx - 1].classList.remove('filled');
        e.preventDefault();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        submitPin();
      }
      if (e.key === 'ArrowLeft' && idx > 0) { fresh[idx - 1].focus(); e.preventDefault(); }
      if (e.key === 'ArrowRight' && idx < fresh.length - 1) { fresh[idx + 1].focus(); e.preventDefault(); }
    });

    box.addEventListener('focus', (e) => e.target.select());

    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text') && banglaToEnglish((e.clipboardData || window.clipboardData).getData('text')).replace(/\D/g, '').slice(0, 4);
      for (let i = 0; i < pasted.length && idx + i < fresh.length; i++) {
        fresh[idx + i].value = pasted[i];
        fresh[idx + i].classList.add('filled');
      }
      if (pasted.length === 4) schedulePinSubmit();
      else fresh[Math.min(idx + pasted.length, fresh.length - 1)].focus();
    });
  });
  document.getElementById('pinVerifyBtn')?.addEventListener('click', submitPin);
  fresh[0]?.focus();
}

function showPinError(msg) {
  const boxes = document.querySelectorAll('.pin-box');
  const errEl = document.getElementById('pinErrorMsg');
  disablePinBoxes(false);
  boxes.forEach(b => {
    b.classList.remove('filled', 'success');
    b.classList.add('error');
    b.value = '';
  });
  if (errEl) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  }
  setTimeout(() => {
    boxes.forEach(b => b.classList.remove('error'));
    boxes[0]?.focus();
  }, 900);
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

function showPinSuccess() {
  const boxes = document.querySelectorAll('.pin-box');
  boxes.forEach(b => { b.classList.remove('error', 'filled'); b.classList.add('success'); });
  const errEl = document.getElementById('pinErrorMsg');
  if (errEl) errEl.classList.add('hidden');
}

function getPinFromBoxes() {
  const boxes = document.querySelectorAll('.pin-box');
  return Array.from(boxes).map(b => banglaToEnglish(b.value)).join('');
}

function clearPinBoxes() {
  const boxes = document.querySelectorAll('.pin-box');
  boxes.forEach(b => {
    b.value = '';
    b.classList.remove('filled', 'error', 'success');
    b.disabled = false;
  });
  const errEl = document.getElementById('pinErrorMsg');
  if (errEl) errEl.classList.add('hidden');
  boxes[0]?.focus();
}

function disablePinBoxes(disabled) {
  document.querySelectorAll('.pin-box').forEach(b => b.disabled = disabled);
}

async function submitPin() {
  if (pinSubmitting) return;
  if (pinSubmitTimer) { clearTimeout(pinSubmitTimer); pinSubmitTimer = null; }
  pinSubmitting = true;
  const verifyBtn = document.getElementById('pinVerifyBtn');
  if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = 'Verifying…'; }
  disablePinBoxes(true);
  try {
    await submitPinRequest();
  } finally {
    pinSubmitting = false;
    disablePinBoxes(false);
    if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = 'Verify PIN'; }
  }
}

async function submitPinRequest() {
  const pin = getPinFromBoxes();
  if (pin.length !== 4) {
    showPinError('Please enter all 4 digits');
    return;
  }

  const errEl = document.getElementById('pinErrorMsg');
  if (errEl) errEl.classList.add('hidden');

  // Cache-first for slow networks
  const cached = localStorage.getItem('amc_last_session_' + pin);
  if (cached) {
    try {
      const sess = JSON.parse(cached);
      if (sess.expires_at && new Date(sess.expires_at) > new Date()) {
        currentPinSession = sess;
        showPinSuccess();
        setTimeout(() => {
          disablePinBoxes(false);
          clearPinBoxes();
          showAttendanceForm();
          // Verify and refresh in background
          if (navigator.onLine) verifyPinBackground(pin);
        }, 200);
        return;
      }
    } catch (e) {}
  }

  if (!navigator.onLine) {
    showPinError('No internet — connect and retry');
    return;
  }

  disablePinBoxes(true);

  try {
    const controller = new AbortController();
    const timeoutMs = getNetworkQuality() === 'slow' ? 12000 : 8000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const { data: sessions, error } = await sessByPin(pin, controller.signal);

    clearTimeout(timeoutId);

    if (error || !sessions || !sessions.length) {
      showPinError('Invalid or expired PIN');
      return;
    }

    currentPinSession = sessions[0];
    localStorage.setItem('amc_last_session_' + pin, JSON.stringify(currentPinSession));
    showPinSuccess();

    setTimeout(async () => {
      disablePinBoxes(false);
      clearPinBoxes();
      // Fire and forget — don't block UI
      enrichPinSession(currentPinSession).catch(() => {});
      cacheStudentsFor(currentPinSession.year, currentPinSession.session_year).catch(() => {});
      showAttendanceForm();
    }, 250);

  } catch (e) {
    if (e.name === 'AbortError') showPinError('Network timeout — try again');
    else showPinError('Network error — try again');
  }
}

async function verifyPinBackground(pin) {
  try {
    const { data: sessions, error: vErr } = await sessByPin(pin);
    if (sessions && sessions.length) {
      currentPinSession = sessions[0];
      localStorage.setItem('amc_last_session_' + pin, JSON.stringify(currentPinSession));
    } else if (!vErr) {
      localStorage.removeItem('amc_last_session_' + pin);
      currentPinSession = null;
      document.getElementById('attendanceModal').classList.add('hidden');
      toastWarning('This PIN has been closed or expired');
    }
  } catch (e) {}
}

async function enrichPinSession(sess) {
  if (!sess) return sess;
  try {
    if (sess.teacher_id && !sess.teacher_name) {
      const { data: t } = await db.from('teachers').select('name').eq('id', sess.teacher_id).maybeSingle();
      if (t && t.name) sess.teacher_name = t.name;
    }
  } catch (e) { console.warn('teacher name', e); }
  try {
    await getCourseInfoMap();
    const info = courseInfo(sess.course_code);
    sess.course_name = info.name || info.short || sess.course_name || '';
  } catch (e) { console.warn('course name', e); }
  return sess;
}

function showAttendanceForm() {
  const s = currentPinSession;
  document.getElementById('attendanceModal').classList.remove('hidden');
  document.getElementById('modalContent').innerHTML = `
    <div class="text-center mb-4">
      <div class="text-4xl mb-1">✅</div>
      <h3 class="text-lg font-bold text-gray-800 dark:text-white">PIN Verified</h3>
      <p class="text-gray-500 dark:text-gray-400 text-sm">📅 <span class="num-display">${escapeHtml(s.date)}</span> · 📚 <span class="num-display">${escapeHtml(s.course_code)}</span></p>
      <p class="text-xs text-gray-400 dark:text-gray-500">${escapeHtml(s.session_year)} · ${escapeHtml(s.year)}</p>
    </div>
    <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">🎓 Class Roll / Registration No</label>
    <input id="studentRollInput" placeholder="e.g., 101, I-345, 2022011" autocomplete="off"
      class="w-full text-center text-xl font-bold border-4 border-indigo-300 dark:border-indigo-600 rounded-2xl p-3 mb-2 focus:outline-none bg-indigo-50 dark:bg-gray-700 dark:text-white"
      autofocus>
    <p class="text-xs text-gray-400 dark:text-gray-500 mb-2">💡 Suggestions appear as you type</p>
    <div id="suggestionBox" class="hidden mb-3"></div>
    <div id="studentPreview" class="mb-3 min-h-[70px] bg-gray-50 dark:bg-gray-700 rounded-xl p-3 text-center flex items-center justify-center">
      <p class="text-xs text-gray-400 dark:text-gray-500">Type full roll or choose from suggestion</p>
    </div>
    <button id="submitAttendanceBtn" onclick="findAndSubmit()" disabled
      class="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold btn-pop disabled:opacity-50 disabled:cursor-not-allowed">
      ✅ Confirm Attendance
    </button>
    <button onclick="closeModal()" class="w-full mt-2 text-gray-500 dark:text-gray-400 py-2 text-sm">Close</button>
  `;
  const input = document.getElementById('studentRollInput');
  let timer = null;
  input.addEventListener('input', (e) => {
    const q = banglaToEnglish(e.target.value.trim());
    if (timer) clearTimeout(timer);
    if (!q) {
      hideSuggestionBox();
      document.getElementById('studentPreview').innerHTML = `<p class="text-xs text-gray-400 dark:text-gray-500">Type full roll or choose from suggestion</p>`;
      document.getElementById('submitAttendanceBtn').disabled = true;
      return;
    }
    timer = setTimeout(() => loadStudentSuggestions(q), 250);
  });
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const box = document.getElementById('suggestionBox');
      if (!box.classList.contains('hidden')) {
        const first = box.querySelector('.suggestion-item');
        if (first) { first.click(); return; }
      }
      findAndSubmit();
    }
  });
  input.focus();
}

async function loadStudentSuggestions(query) {
  const s = currentPinSession;
  if (!s) return;
  const q = String(query).replace(/[,()*%]/g, '');
  if (!q) return;
  if (!navigator.onLine) {
    const cached = localStorage.getItem('amc_students_' + s.year + '_' + s.session_year);
    if (cached) {
      const all = JSON.parse(cached);
      const lc = q.toLowerCase();
      let f = all.filter(st => String(st.class_roll) === q || String(st.reg_no) === q);
      if (!f.length) f = all.filter(st => String(st.class_roll || '').toLowerCase().includes(lc) || String(st.reg_no || '').toLowerCase().includes(lc) || String(st.name || '').toLowerCase().includes(lc));
      return renderSuggestions(f.slice(0, 10));
    }
    return;
  }
  try {
    const cols = 'id, name, class_roll, reg_no, session, is_irregular';
    let { data: hit } = await db.from('students').select(cols).eq('year', s.year).eq('session_year', s.session_year).eq('status', 'active').or(rollFilter(q, false)).limit(5);
    if (!hit || !hit.length) {
      const r = await db.from('students').select(cols).eq('year', s.year).eq('session_year', s.session_year).eq('status', 'active').or(rollFilter(q, true)).limit(10);
      hit = r.data || [];
    }
    renderSuggestions(hit);
  } catch (err) { console.error('Suggestion error:', err); renderSuggestions([]); }
}

function renderSuggestions(students) {
  if (!students || !students.length) {
    hideSuggestionBox();
    document.getElementById('studentPreview').innerHTML = `<p class="text-red-500 text-sm font-bold">❌ No student found with this roll</p>`;
    document.getElementById('submitAttendanceBtn').disabled = true;
    return;
  }
  const sorted = sortStudents(students);
  const box = document.getElementById('suggestionBox');
  box.classList.remove('hidden');
  box.className = 'suggestion-box mb-3';
  box.innerHTML = sorted.map(stu => `
    <div class="suggestion-item" data-id="${escapeHtml(stu.id)}" data-roll="${escapeHtml(stu.class_roll)}" data-name="${escapeHtml(stu.name)}" data-reg="${escapeHtml(stu.reg_no || '')}">
      <div>
        <div class="font-bold text-sm"><span class="num-display">${escapeHtml(stu.class_roll)}</span> — ${escapeHtml(stu.name)}${stu.is_irregular ? ' <span class="chip chip-none">Irregular</span>' : ''}</div>
<div class="text-xs text-gray-500 dark:text-gray-400">Reg: <span class="num-display">${escapeHtml(stu.reg_no || '-')}</span>${stu.is_irregular && stu.session ? ' · ' + escapeHtml(stu.session) : ''}</div>
      </div>
      <span class="text-indigo-500">›</span>
    </div>`).join('');
  box.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => selectStudent(item.dataset.id, item.dataset.roll, item.dataset.name, item.dataset.reg));
  });
}

function hideSuggestionBox() {
  const b = document.getElementById('suggestionBox');
  if (b) { b.classList.add('hidden'); b.innerHTML = ''; }
}

async function selectStudent(studentId, roll, name, reg) {
  pickedStudent = { id: studentId, class_roll: roll, name, reg_no: reg };
  hideSuggestionBox();
  document.getElementById('studentRollInput').value = roll;
  const preview = document.getElementById('studentPreview');
  preview.innerHTML = `
    <div class="text-center">
      <p class="text-xs text-emerald-600 mb-1">✅ Selected</p>
      <p class="text-lg font-bold text-gray-800 dark:text-white">${escapeHtml(name)}</p>
      <p class="text-xs text-gray-500 dark:text-gray-400">Roll: <span class="num-display">${escapeHtml(roll)}</span></p>
    </div>`;
  document.getElementById('submitAttendanceBtn').disabled = false;
}

async function findAndSubmit() {
  const roll = banglaToEnglish(document.getElementById('studentRollInput').value.trim()).replace(/[,()*%]/g, '');
  if (!roll) return toastWarning('Enter roll');
  const s = currentPinSession;
  if (!s) return toastError('Session not found, re-enter PIN');
  if (pickedStudent && String(pickedStudent.class_roll) === roll) { showConfirmationScreen(pickedStudent, s); return; }
  let student = null;
  if (!navigator.onLine) {
    const cached = localStorage.getItem('amc_students_' + s.year + '_' + s.session_year);
    if (cached) {
      const all = JSON.parse(cached);
      student = all.find(st => String(st.class_roll) === roll || String(st.reg_no) === roll);
    }
  } else {
    const cols = 'id, name, class_roll, reg_no, session, is_irregular';
    const { data: exact } = await db.from('students').select(cols).eq('year', s.year).eq('session_year', s.session_year).eq('status', 'active').or(rollFilter(roll, false)).limit(5);
    if (exact && exact.length > 1) { renderSuggestions(exact); toastInfo('Several students match — please pick yours'); return; }
    if (exact && exact.length === 1) student = exact[0];
    else {
      const { data: part } = await db.from('students').select(cols).eq('year', s.year).eq('session_year', s.session_year).eq('status', 'active').or(rollFilter(roll, true)).limit(2);
      if (part && part.length === 1) student = part[0];
      else if (part && part.length > 1) { renderSuggestions(part); toastInfo('Several students match — please pick yours'); return; }
    }
  }
  if (!student) {
    document.getElementById('studentPreview').innerHTML = `<p class="text-red-500 text-center text-sm font-bold">❌ No student with roll (${escapeHtml(roll)})</p>`;
    return;
  }
  if (navigator.onLine && (!s.teacher_name || !s.course_name)) enrichPinSession(s).catch(() => {});
  showConfirmationScreen(student, s);
}

function showConfirmationScreen(student, session) {
  pendingConfirmation = { student, session };
  document.getElementById('attendanceModal').classList.remove('hidden');
  document.getElementById('modalContent').innerHTML = `
    <div class="text-center fade-in">
      <div class="text-4xl mb-2">⚠️</div>
      <h3 class="text-2xl font-bold text-amber-600 dark:text-amber-400 mb-4">Please Confirm</h3>
      <div class="bg-indigo-50 dark:bg-indigo-900/40 rounded-2xl p-6 mb-4">
        <p class="text-6xl font-bold text-indigo-600 dark:text-indigo-300 num-display mb-3">${escapeHtml(student.class_roll)}</p>
        <div class="border-t-2 border-indigo-300 dark:border-indigo-600 my-3"></div>
        <p class="text-2xl font-bold text-gray-800 dark:text-white mb-1">${escapeHtml(student.name)}</p>
        <p class="text-sm text-gray-600 dark:text-gray-300 num-display">Reg: ${escapeHtml(student.reg_no || '-')}</p>
      </div>
      <div class="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 mb-5">
        <p class="text-xs text-gray-500 dark:text-gray-400">Course Code</p>
        <p class="text-5xl font-bold text-indigo-700 dark:text-indigo-300 num-display leading-tight">${escapeHtml(session.course_code)}</p>
        ${session.course_name ? `<p class="text-base font-bold text-gray-700 dark:text-gray-200 mt-1">${escapeHtml(session.course_name)}</p>` : ''}
        <div class="border-t border-gray-200 dark:border-gray-600 my-3"></div>
        ${session.teacher_name ? `<p class="text-xs text-gray-500 dark:text-gray-400">Teacher</p><p class="text-base font-bold text-gray-800 dark:text-white mb-2">👨‍🏫 ${escapeHtml(session.teacher_name)}</p>` : ''}
        <p class="text-xs text-gray-500 dark:text-gray-400">Date</p>
        <p class="text-base font-bold text-gray-800 dark:text-white num-display">${escapeHtml(session.date)}</p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button onclick="cancelConfirmation()" class="bg-red-600 text-white py-4 rounded-2xl font-bold btn-pop text-lg">❌ NO</button>
        <button onclick="confirmAndSubmit()" class="bg-emerald-600 text-white py-4 rounded-2xl font-bold btn-pop text-lg">✅ YES</button>
      </div>
      <p class="text-xs text-gray-400 dark:text-gray-500 mt-4">💡 Verify this is the correct student</p>
    </div>`;
}

function cancelConfirmation() {
  pendingConfirmation = null;
  showAttendanceForm();
}

async function confirmAndSubmit() {
  if (!pendingConfirmation) return;
  const { student } = pendingConfirmation;
  if (!navigator.onLine) {
    let geoQ = null;
    // Offline: use only the last known setting. The server rechecks the current setting
    // before saving and discards coordinates if Geo has since been switched OFF.
    const offlineGeoCfg = (typeof geoCfg !== 'undefined') ? geoCfg : { enabled: false };
    if (offlineGeoCfg.enabled) geoQ = await getPositionOnce();
    queueAttendance(currentPinSession.pin, student.class_roll, student.id, geoQ);
    pendingConfirmation = null;
    showSuccessAndNext(student.name);
    return;
  }
  showGlobalLoader();
  try {
    let geo = null;
    // Refresh the server setting before asking the student device for GPS.
    const gcfg = (typeof getGeoConfig === 'function') ? await getGeoConfig(true) : { enabled: false };
    if (gcfg.enabled) geo = await getPositionOnce();
    const { data, error } = student.id
      ? await (typeof markAttendanceGeo === 'function' ? markAttendanceGeo(currentPinSession.pin, student.id, deviceId, geo) : db.rpc('student_mark_attendance_v3', { p_pin: currentPinSession.pin, p_student_id: student.id, p_device_id: deviceId }))
      : await db.rpc('student_mark_attendance_v2', { p_pin: currentPinSession.pin, p_roll: student.class_roll, p_device_id: deviceId });
    if (error) {
      document.getElementById('modalContent').innerHTML = `<div class="text-center"><div class="text-6xl mb-3">❌</div><p class="text-red-500 font-bold">Network error</p><button onclick="showAttendanceForm()" class="w-full mt-4 bg-gray-800 text-white py-3 rounded-xl font-bold">Back</button></div>`;
      return;
    }
    if (!data.ok) {
      document.getElementById('modalContent').innerHTML = `<div class="text-center"><div class="text-6xl mb-3">⚠️</div><p class="text-amber-600 font-bold mb-4">${escapeHtml(data.message)}</p><button onclick="showAttendanceForm()" class="w-full bg-gray-800 text-white py-3 rounded-xl font-bold">Back</button></div>`;
      return;
    }
    pendingConfirmation = null;
    showSuccessAndNext(data.student_name);
  } finally { hideGlobalLoader(); }
}

function showSuccessAndNext(name) {
  document.getElementById('modalContent').innerHTML = `
    <div class="text-center fade-in">
      <div class="text-6xl mb-3">🎉</div>
      <h3 class="text-xl font-bold text-emerald-600 mb-1">Attendance Marked!</h3>
      <p class="text-gray-700 dark:text-gray-300 font-bold mb-4">${escapeHtml(name)}</p>
      <p class="text-gray-500 dark:text-gray-400 text-sm mb-6">📅 <span class="num-display">${escapeHtml(currentPinSession.date)}</span> · 📚 <span class="num-display">${escapeHtml(currentPinSession.course_code)}</span></p>
      <button onclick="showAttendanceForm()" class="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold btn-pop text-lg">➕ Add Another</button>
      <button onclick="closeModal()" class="w-full mt-3 text-gray-500 dark:text-gray-400 py-2 text-sm">Done</button>
    </div>`;
}

function showModal(icon, title, msg, color) {
  const colors = { red: 'text-red-600', amber: 'text-amber-600', emerald: 'text-emerald-600' };
  document.getElementById('attendanceModal').classList.remove('hidden');
  document.getElementById('modalContent').innerHTML = `
    <div class="text-center">
      <div class="text-6xl mb-3">${icon}</div>
      <h3 class="text-xl font-bold ${colors[color]||'text-gray-800'} mb-2">${escapeHtml(title)}</h3>
      <p class="text-gray-600 dark:text-gray-400 mb-5">${escapeHtml(msg)}</p>
      <button onclick="closeModal()" class="w-full bg-gray-800 dark:bg-gray-600 text-white py-3 rounded-xl font-bold btn-pop">OK</button>
    </div>`;
}

function closeModal() {
  document.getElementById('attendanceModal').classList.add('hidden');
  clearPinBoxes();
  currentPinSession = null;
  pendingConfirmation = null;
}

document.getElementById('attendanceModal').addEventListener('click', (e) => {
  if (e.target.id === 'attendanceModal') closeModal();
});
