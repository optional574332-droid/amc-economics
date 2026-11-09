/* js/gps-report.js — private GPS attendance report */
let currentGpsRows = [];
function gpsReportEscape(v) { return escapeHtml(v == null ? '' : String(v)); }
function gpsReportDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour12: true });
}
function gpsMapsUrl(row) {
  const lat = Number(row.latitude), lng = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return '';
  return 'https://www.google.com/maps?q=' + encodeURIComponent(lat + ',' + lng);
}
function gpsStatusLabel(row) {
  if (!row.has_coordinates) return 'GPS not captured';
  const labels = { inside: 'Inside radius', outside: 'Outside radius', poor_accuracy: 'Poor accuracy', no_location: 'No location' };
  return labels[row.geo_status] || row.geo_status || 'Location captured';
}
function gpsReportFormHtml(prefix, teacherMode) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
  return '<div class="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 space-y-3">' +
    '<div class="grid grid-cols-2 gap-2">' +
    '<label class="text-xs font-semibold dark:text-white">From<input id="' + prefix + 'From" type="date" value="' + today + '" class="w-full border-2 rounded-lg p-2 dark:bg-gray-600 dark:text-white"></label>' +
    '<label class="text-xs font-semibold dark:text-white">To<input id="' + prefix + 'To" type="date" value="' + today + '" class="w-full border-2 rounded-lg p-2 dark:bg-gray-600 dark:text-white"></label></div>' +
    '<div class="grid grid-cols-2 gap-2"><label class="text-xs font-semibold dark:text-white">Class/year<select id="' + prefix + 'Year" class="w-full border-2 rounded-lg p-2 dark:bg-gray-600 dark:text-white">' +
    '<option value="">All classes</option><option>1st Year</option><option>2nd Year</option><option>3rd Year</option><option>4th Year</option><option>Preliminary to Masters</option><option>Masters Final</option></select></label>' +
    '<label class="text-xs font-semibold dark:text-white">Session year<input id="' + prefix + 'SY" type="number" min="2000" max="2100" placeholder="e.g. 2021" class="w-full border-2 rounded-lg p-2 dark:bg-gray-600 dark:text-white"></label></div>' +
    '<button onclick="loadGpsAttendanceReport(\'' + prefix + '\',' + (teacherMode ? 'true' : 'false') + ')" class="w-full bg-indigo-600 text-white px-4 py-3 rounded-xl font-bold">🔍 Show GPS Report</button></div>' +
    '<div id="' + prefix + 'Result" class="mt-3"></div>';
}
async function showGpsAdminReport() {
  const el = document.getElementById('adminContent');
  if (!el) return;
  el.innerHTML = '<div class="space-y-3"><h3 class="text-lg font-bold dark:text-white">🛰️ GPS Attendance Tracking</h3><p class="text-xs text-gray-500 dark:text-gray-400">Exact student coordinates are restricted to administrators. Maximum date range: 31 days.</p>' + gpsReportFormHtml('gpsAdmin', false) + '</div>';
}
async function showGpsTeacherReport() {
  const area = document.getElementById('teacherAttendanceReportArea');
  if (!area) return toastWarning('Open Attendance Report first');
  const existing = document.getElementById('gpsTeacherPanel');
  if (existing) { existing.remove(); return; }
  const panel = document.createElement('div');
  panel.id = 'gpsTeacherPanel';
  panel.className = 'mt-4 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl p-3';
  panel.innerHTML = '<h4 class="font-bold dark:text-white mb-2">🛰️ GPS Attendance Tracking</h4><p class="text-xs text-gray-500 dark:text-gray-400 mb-3">You can view only sessions assigned to you or courses mapped to your account.</p>' + gpsReportFormHtml('gpsTeacher', true);
  area.prepend(panel);
  const from = document.getElementById('tarFrom')?.value, to = document.getElementById('tarTo')?.value;
  if (from) document.getElementById('gpsTeacherFrom').value = from;
  if (to) document.getElementById('gpsTeacherTo').value = to;
  const y = document.getElementById('tarYear')?.value || '', sy = document.getElementById('tarSY')?.value || '';
  if (y) document.getElementById('gpsTeacherYear').value = y;
  if (sy) document.getElementById('gpsTeacherSY').value = sy;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function loadGpsAttendanceReport(prefix, teacherMode) {
  const from = document.getElementById(prefix + 'From')?.value, to = document.getElementById(prefix + 'To')?.value;
  const year = document.getElementById(prefix + 'Year')?.value || null;
  const syRaw = document.getElementById(prefix + 'SY')?.value || '';
  const sessionYear = syRaw ? Number(syRaw) : null;
  const result = document.getElementById(prefix + 'Result');
  if (!from || !to || from > to) return toastWarning('Select a valid date range');
  if ((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000 > 31) return toastWarning('Maximum date range is 31 days');
  if (syRaw && (!Number.isInteger(sessionYear) || sessionYear < 2000 || sessionYear > 2100)) return toastWarning('Invalid session year');
  if (result) result.innerHTML = '<p class="text-center py-4">⏳ Loading GPS records...</p>';
  try {
    const args = { p_token: teacherMode ? currentTeacher?.token : null, p_from: from, p_to: to, p_year: year, p_session_year: sessionYear, p_course_code: null };
    const response = await db.rpc('gps_attendance_report', args);
    if (response.error) throw response.error;
    if (!response.data?.ok) throw new Error(response.data?.message || 'Could not load GPS report');
    currentGpsRows = response.data.rows || [];
    renderGpsAttendanceRows(result, currentGpsRows);
  } catch (e) {
    if (result) result.innerHTML = '<p class="text-red-600 text-sm p-3">❌ ' + gpsReportEscape(e.message) + '</p>';
  }
}
function renderGpsAttendanceRows(target, rows) {
  if (!target) return;
  if (!rows.length) { target.innerHTML = '<p class="text-gray-500 text-center py-5">No attendance records found for this filter.</p>'; return; }
  const located = rows.filter(r => r.has_coordinates).length, missing = rows.length - located;
  const body = rows.map(r => {
    const url = gpsMapsUrl(r);
    const coords = r.has_coordinates ? Number(r.latitude).toFixed(6) + ', ' + Number(r.longitude).toFixed(6) : '-';
    const location = url ? '<a class="text-blue-600 underline" target="_blank" rel="noopener" href="' + gpsReportEscape(url) + '">Google Maps</a><br><span class="text-[10px]">' + gpsReportEscape(coords) + '</span>' : '-';
    return '<tr class="dark:text-white"><td class="p-2 border whitespace-nowrap">' + gpsReportEscape(r.date) + '<br>' + gpsReportEscape(gpsReportDate(r.marked_at)) + '</td>' +
      '<td class="p-2 border whitespace-nowrap">' + gpsReportEscape(r.roll) + '<br>' + gpsReportEscape(r.reg_no || '-') + '</td>' +
      '<td class="p-2 border">' + gpsReportEscape(r.student_name) + '</td><td class="p-2 border whitespace-nowrap">' + gpsReportEscape(r.year) + '<br>' + gpsReportEscape(r.course_code) + '</td>' +
      '<td class="p-2 border text-center">' + (r.distance_m == null ? '-' : gpsReportEscape(r.distance_m) + ' m') + '</td>' +
      '<td class="p-2 border text-center">' + (r.accuracy_m == null ? '-' : gpsReportEscape(r.accuracy_m) + ' m') + '</td>' +
      '<td class="p-2 border">' + gpsReportEscape(gpsStatusLabel(r)) + '</td><td class="p-2 border">' + location + '</td></tr>';
  }).join('');
  target.innerHTML = '<div class="grid grid-cols-3 gap-2 mb-3 text-center">' +
    '<div class="bg-slate-100 dark:bg-slate-700 rounded-lg p-2"><b class="text-xl num-display">' + rows.length + '</b><p class="text-xs">Records</p></div>' +
    '<div class="bg-emerald-50 dark:bg-emerald-900/30 rounded-lg p-2"><b class="text-xl num-display">' + located + '</b><p class="text-xs">GPS captured</p></div>' +
    '<div class="bg-amber-50 dark:bg-amber-900/30 rounded-lg p-2"><b class="text-xl num-display">' + missing + '</b><p class="text-xs">No coordinates</p></div></div>' +
    '<div class="overflow-x-auto max-h-[600px] overflow-y-auto"><table class="min-w-full text-xs border dark:border-gray-600"><thead class="sticky top-0 bg-gray-100 dark:bg-gray-600"><tr>' +
    '<th class="p-2 border">Date/time</th><th class="p-2 border">Roll / Reg</th><th class="p-2 border text-left">Student</th><th class="p-2 border">Class/Course</th><th class="p-2 border">Distance</th><th class="p-2 border">Accuracy</th><th class="p-2 border">GPS status</th><th class="p-2 border">Location</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
    '<p class="text-[11px] text-gray-500 mt-2">GPS coordinates are device-reported and may be inaccurate or spoofed; use them as supporting evidence, not conclusive proof of physical presence.</p>';
}
