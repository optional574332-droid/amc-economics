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
    if (!student.id) {
      document.getElementById('modalContent').innerHTML = `<div class="text-center"><p class="text-red-500 font-bold mb-3">Student verification is incomplete</p><p class="text-gray-600 dark:text-gray-300 mb-4">Please connect to the internet, reload the page and try again. No attendance has been submitted.</p><button onclick="showAttendanceForm()" class="w-full bg-gray-800 text-white py-3 rounded-xl font-bold">Back</button></div>`;
      return;
    }
    let geoQ = null;
    // Offline submissions are queued with the student UUID and synced only through v4.
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
    if (gcfg.enabled) {
      const locationResult = await getPositionDetailed();
      geo = locationResult.position;
      if (!geo) {
        showGeoAttendanceWarning(locationResult.error);
        return;
      }
    }
    if (!student.id) {
      document.getElementById('modalContent').innerHTML = `<div class="text-center"><p class="text-red-500 font-bold mb-3">Student verification is incomplete</p><p class="text-gray-600 dark:text-gray-300 mb-4">Please reload the page and try again. No attendance has been submitted.</p><button onclick="showAttendanceForm()" class="w-full bg-gray-800 text-white py-3 rounded-xl font-bold">Back</button></div>`;
      return;
    }
    if (typeof markAttendanceGeo !== 'function') throw new Error('Secure attendance service is unavailable. Please reload and try again.');
    const { data, error } = await markAttendanceGeo(currentPinSession.pin, student.id, deviceId, geo);
    if (error) {
      document.getElementById('modalContent').innerHTML = `<div class="text-center"><div class="text-6xl mb-3">❌</div><p class="text-red-500 font-bold">Network error</p><button onclick="showAttendanceForm()" class="w-full mt-4 bg-gray-800 text-white py-3 rounded-xl font-bold">Back</button></div>`;
      return;
    }
    if (!data.ok) {
      if (data.geo_status) {
        showGeoAttendanceWarning(data.geo_status, data.message);
      } else {
        document.getElementById('modalContent').innerHTML = `<div class="text-center"><div class="text-6xl mb-3">⚠️</div><p class="text-amber-600 font-bold mb-4">${escapeHtml(data.message)}</p><button onclick="showAttendanceForm()" class="w-full bg-gray-800 text-white py-3 rounded-xl font-bold">Back</button></div>`;
      }
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
