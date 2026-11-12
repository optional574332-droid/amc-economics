/* js/geo.js — জিও-লোকেশন: ছাত্র হাজিরায় দূরত্ব যাচাই (log/block) + অ্যাডমিন সেটিং ট্যাব
   RPC: get_geo_config, student_mark_attendance_v4, admin_get_geo_settings, admin_set_geo_settings
   v4 না থাকলে বা জিও বন্ধ থাকলে আগের v3 পথেই চলে */

let geoCfg = { enabled: false, mode: 'log', at: 0 };

async function getGeoConfig(forceRefresh = false) {
  if (!forceRefresh && Date.now() - geoCfg.at < 5 * 60 * 1000) return geoCfg;
  try {
    const res = await Promise.race([db.rpc('get_geo_config'), new Promise(r => setTimeout(() => r({ error: 'timeout' }), 3000))]);
    if (!res.error && res.data) {
      geoCfg = { enabled: !!res.data.enabled, mode: res.data.mode || 'log', at: Date.now() };
    } else if (forceRefresh) {
      // Fail closed: if the current server setting cannot be confirmed, do not request GPS.
      return { enabled: false, mode: geoCfg.mode || 'log', at: Date.now() };
    }
  } catch (e) {
    if (forceRefresh) return { enabled: false, mode: geoCfg.mode || 'log', at: Date.now() };
  }
  return geoCfg;
}

function getPositionDetailed(timeoutMs, maxAgeMs) {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({ position: null, error: 'unsupported' });
    navigator.geolocation.getCurrentPosition(
      p => resolve({ position: { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }, error: null }),
      e => resolve({ position: null, error: e && e.code === 1 ? 'permission_denied' : e && e.code === 3 ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: timeoutMs || 10000, maximumAge: maxAgeMs === undefined ? 15000 : maxAgeMs });
  });
}

async function getPositionOnce(timeoutMs, maxAgeMs) {
  const result = await getPositionDetailed(timeoutMs, maxAgeMs);
  return result.position;
}

async function markAttendanceGeo(pin, studentId, devId, geo) {
  const args = { p_pin: pin, p_student_id: studentId, p_device_id: devId, p_lat: geo ? geo.lat : null, p_lng: geo ? geo.lng : null, p_accuracy: geo ? geo.acc : null };
  let res = await db.rpc('student_mark_attendance_v4', args);
  if (res.error && (res.error.code === 'PGRST202' || /could not find the function/i.test(res.error.message || ''))) {
    res = await db.rpc('student_mark_attendance_v3', { p_pin: pin, p_student_id: studentId, p_device_id: devId });
  }
  return res;
}

// ---------------- Admin: Geo ট্যাব ----------------
const _origShowAdminTabGeo = showAdminTab;
showAdminTab = async function (tab) {
  if (tab === 'geo') { currentAdminTab = 'geo'; markActiveTab('adminTabs', tab); return geoAdminRender(); }
  return _origShowAdminTabGeo(tab);
};

async function geoAdminRender() {
  const el = document.getElementById('adminContent');
  if (!el) return;
  el.innerHTML = '<div class="text-center py-8 text-gray-500">⏳ Loading...</div>';
  const { data, error } = await db.rpc('admin_get_geo_settings');
  if (currentAdminTab !== 'geo') return;
  if (error || !data || !data.ok) { el.innerHTML = `<p class="text-red-500 text-center py-8">❌ ${escapeHtml(data?.message || error?.message || 'Failed to load')}</p>`; return; }
  const inp = 'w-full border-2 rounded-xl p-2 dark:bg-gray-700 dark:text-white dark:border-gray-600';
  const lbl = 'block text-sm font-semibold dark:text-white';
  el.innerHTML = `<div class="max-w-xl mx-auto space-y-4">
    <h3 class="text-xl font-bold dark:text-white">📍 Geo Location</h3>
    <p class="text-xs text-gray-500 dark:text-gray-400"><b>OFF:</b> attendance works normally; the student GPS is not requested or saved. <b>ON + Allow:</b> GPS is recorded, but attendance is accepted even outside the radius. <b>ON + Block:</b> attendance is rejected outside the radius or when GPS is unavailable.</p>
    <div class="grid grid-cols-2 gap-3">
      <label class="${lbl}">Status<select id="geoEnabled" class="${inp}"><option value="0">OFF</option><option value="1">ON</option></select></label>
      <label class="${lbl}">Outside radius<select id="geoMode" class="${inp}"><option value="log">Allow attendance + record GPS</option><option value="block">Block attendance</option></select></label>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <label class="${lbl}">Latitude<input id="geoLat" type="number" step="any" class="${inp}"></label>
      <label class="${lbl}">Longitude<input id="geoLng" type="number" step="any" class="${inp}"></label>
    </div>
    <button onclick="geoUseMyLocation()" class="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold btn-pop">📍 Set from my current location</button>
    <p id="geoLocInfo" class="text-xs text-gray-500 dark:text-gray-400"></p>
    <div class="grid grid-cols-2 gap-3">
      <label class="${lbl}">Radius (m)<input id="geoRadius" type="number" min="20" max="5000" value="100" class="${inp}"></label>
      <label class="${lbl}">Max GPS error (m)<input id="geoMaxAcc" type="number" min="20" max="1000" class="${inp}"></label>
    </div>
    <button onclick="geoSave()" class="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold btn-pop">💾 Save</button>
  </div>`;
  document.getElementById('geoEnabled').value = data.enabled ? '1' : '0';
  document.getElementById('geoMode').value = data.mode || 'log';
  document.getElementById('geoLat').value = data.lat ?? '';
  document.getElementById('geoLng').value = data.lng ?? '';
  document.getElementById('geoRadius').value = data.radius_m ?? 100;
  document.getElementById('geoMaxAcc').value = data.max_accuracy_m ?? 150;
}

async function geoUseMyLocation() {
  const info = document.getElementById('geoLocInfo');
  if (info) info.textContent = '⏳ Getting location (stand outside or near a window)...';
  const p = await getPositionOnce(20000, 0);
  if (!p) { if (info) info.textContent = ''; return toastError('Could not get location. Allow location access and try again.'); }
  document.getElementById('geoLat').value = p.lat.toFixed(6);
  document.getElementById('geoLng').value = p.lng.toFixed(6);
  if (info) info.textContent = `Accuracy ±${Math.round(p.acc)} m` + (p.acc > 50 ? ' — low accuracy, try again outdoors for a better fix' : ' — good');
  if (p.acc > 50) toastWarning('Low GPS accuracy');
}

async function geoSave() {
  const enabled = document.getElementById('geoEnabled').value === '1';
  const mode = document.getElementById('geoMode').value;
  const latV = document.getElementById('geoLat').value, lngV = document.getElementById('geoLng').value;
  const lat = latV === '' ? null : parseFloat(latV), lng = lngV === '' ? null : parseFloat(lngV);
  const radius = parseInt(document.getElementById('geoRadius').value, 10);
  const maxAcc = parseInt(document.getElementById('geoMaxAcc').value, 10);
  if (enabled && mode === 'block') {
    const c = await Swal.fire({ title: 'Enable attendance blocking?', text: 'Students outside the selected radius (or without GPS location) will NOT be able to mark attendance.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes, block' });
    if (!c.isConfirmed) return;
  }
  const { data, error } = await db.rpc('admin_set_geo_settings', { p_enabled: enabled, p_mode: mode, p_lat: lat, p_lng: lng, p_radius: radius, p_max_acc: maxAcc });
  if (error || !data || !data.ok) return toastError(data?.message || error?.message || 'Save failed');
  geoCfg.at = 0;
  toastSuccess('Geo settings saved');
}
