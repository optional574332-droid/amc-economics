/* js/admin.js — Admin ড্যাশবোর্ড, ট্যাব, নোটিশ */
// ============================================================
// ADMIN STATS
// ============================================================
async function loadAdminDashboardStats() {
  const el = document.getElementById('adminDashboardStats');
  if (!el) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    const [teachers, students, sessions, activePins] = await Promise.all([
      db.from('teachers').select('id', { count: 'exact', head: true }).eq('is_admin', false),
      db.from('students').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      db.from('attendance_sessions').select('id', { count: 'exact', head: true }).eq('date', today),
      db.from('attendance_sessions').select('id', { count: 'exact', head: true }).eq('is_active', true).gte('expires_at', new Date().toISOString())
    ]);

    el.innerHTML = `
      <div class="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-xl text-center text-white shadow-lg">
        <p class="text-3xl font-extrabold num-display">${teachers.count || 0}</p>
        <p class="text-xs opacity-90 mt-1 font-semibold">Total Teachers</p>
      </div>
      <div class="bg-gradient-to-br from-emerald-500 to-teal-600 p-4 rounded-xl text-center text-white shadow-lg">
        <p class="text-3xl font-extrabold num-display">${students.count || 0}</p>
        <p class="text-xs opacity-90 mt-1 font-semibold">Active Students</p>
      </div>
      <div class="bg-gradient-to-br from-amber-500 to-orange-600 p-4 rounded-xl text-center text-white shadow-lg">
        <p class="text-3xl font-extrabold num-display">${sessions.count || 0}</p>
        <p class="text-xs opacity-90 mt-1 font-semibold">Today's Classes</p>
      </div>
      <div class="bg-gradient-to-br from-red-500 to-pink-600 p-4 rounded-xl text-center text-white shadow-lg">
        <p class="text-3xl font-extrabold num-display">${activePins.count || 0}</p>
        <p class="text-xs opacity-90 mt-1 font-semibold">Active PINs</p>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="col-span-full text-red-500 text-sm">❌ Stats failed: ${escapeHtml(err.message)}</p>`;
  }
}

// ============================================================
// ADMIN TABS
// ============================================================
let allTeachers = [];
let currentAdminTab = '';

async function showAdminTab(tab) {
  currentAdminTab = tab;
  const el = document.getElementById('adminContent');
  if (tab === 'gpsReport') { if (typeof showGpsAdminReport === 'function') return showGpsAdminReport(); }
  if (tab === 'examSchedule') {
    if (typeof exsOpenTab === 'function') exsOpenTab(el);
    else el.innerHTML = '<div class="text-center py-8 text-red-500">Exam Schedule could not load. Please refresh the page.</div>';
    return;
  }

  if (tab === 'manageTeacher') {
    el.innerHTML = '<div class="text-center py-8 text-gray-500">⏳ Loading...</div>';
    const tCols = 'id, name, name_code, designation, bcs_batch, mobile, email, id_no, user_id, biography, is_active, is_admin, subject';
    let tRes = await db.from('teachers').select(tCols + ', whatsapp').order('name');
    if (tRes.error && /whatsapp/i.test(tRes.error.message || '')) { teacherWaCol = false; tRes = await db.from('teachers').select(tCols).order('name'); }
    else if (!tRes.error) teacherWaCol = true;
    const { data, error } = tRes;
    if (currentAdminTab !== 'manageTeacher') return;
    if (error) { el.innerHTML = `<p class="text-red-500 text-center py-8">❌ ${escapeHtml(error.message)}</p>`; return; }
    allTeachers = data || [];

    el.innerHTML = `
      <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h3 class="text-xl font-bold dark:text-white">👨‍🏫 Teacher Management</h3>
        <button onclick="showTeacherForm()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg btn-pop font-bold">+ Add Teacher</button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${allTeachers.length ? allTeachers.map(t => {
          const active = t.is_active !== false;
          return `
          <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl border-l-4 ${active ? 'border-emerald-500' : 'border-red-500'}">
            <div class="flex justify-between items-start gap-2">
              <div class="min-w-0">
                <p class="font-bold dark:text-white">${escapeHtml(t.name)}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(t.designation || 'Teacher')}</p>
              </div>
              <div class="flex flex-col items-end gap-1">
                <span class="text-xs px-2 py-1 rounded ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}">${active ? 'Active' : 'Inactive'}</span>
                ${t.is_admin ? '<span class="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs">Admin</span>' : ''}
              </div>
            </div>
            <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              <p>ID: <span class="num-display">${escapeHtml(t.user_id || t.id_no || '-')}</span></p>
              <p>Mobile: <span class="num-display">${escapeHtml(t.mobile || '-')}</span></p>
            </div>
            <div class="mt-3 flex gap-2">
              <button onclick="viewTeacherProfile('${escapeHtml(t.id)}')" class="flex-1 bg-blue-500 text-white py-1 rounded text-xs font-bold">View</button>
              ${t.is_admin ? '<span class="flex-[2] text-center text-xs text-gray-400 py-1">Protected</span>' : `<button onclick="showTeacherForm('${escapeHtml(t.id)}')" class="flex-1 bg-amber-500 text-white py-1 rounded text-xs font-bold">Edit</button><button onclick="toggleTeacherStatus('${escapeHtml(t.id)}', ${active})" class="flex-1 ${active ? 'bg-red-500' : 'bg-emerald-500'} text-white py-1 rounded text-xs font-bold">${active ? 'Deactivate' : 'Activate'}</button>`}
            </div>
          </div>`;
        }).join('') : '<p class="text-gray-400 text-sm col-span-full">No teachers</p>'}
      </div>
    `;
  }
  else if (tab === 'academicSetup') {
    el.innerHTML = `
      <div class="space-y-4 max-w-3xl">
        <h3 class="text-lg font-bold dark:text-white">🎓 Academic Setup</h3>
        <div class="flex gap-2 flex-wrap">
          <button id="acTabCourses" onclick="acSwitch('courses')" class="tab-pill active">📚 Courses</button>
          <button id="acTabExams" onclick="acSwitch('exams')" class="tab-pill">📝 Exam Types</button>
        </div>
        <div id="acPaneCourses" class="space-y-4">
        <div class="bg-teal-50 dark:bg-teal-900/30 p-4 rounded-xl max-w-lg">
          <h4 class="font-bold text-sm mb-3 dark:text-white">📚 Add New Course</h4>
          <select id="acCategory" onchange="acFillYears('acCategory','acYear')" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
            <option>Higher Secondary</option><option>Honours</option><option>Masters</option>
          </select>
          <select id="acYear" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600"></select>
          <input id="acName" placeholder="Course name (e.g., Macroeconomics)" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          <input id="acCode" placeholder="Course code (e.g., 22205)" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          <input id="acShort" placeholder="Short code (e.g., Macro)" class="w-full border-2 rounded-xl p-3 mb-3 dark:bg-gray-700 dark:text-white dark:border-gray-600">
          <button onclick="addAcademicCourse()" class="bg-teal-600 text-white px-6 py-3 rounded-xl font-bold btn-pop w-full">Save</button>
        </div>
        <div class="bg-teal-50 dark:bg-teal-900/30 p-4 rounded-xl max-w-lg">
<h4 class="font-bold text-sm mb-2 dark:text-white">📂 Import courses from Excel</h4>
<p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Uses the category and year selected above. Excel columns: <b>Course Code | Course Name | Short Code</b></p>
<input type="file" id="courseExcelFile" accept=".xlsx,.xls" class="w-full text-sm mb-2 dark:text-white">
<button onclick="importCoursesExcel()" class="bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-3 rounded-xl font-bold btn-pop w-full shadow-lg">📥 Import</button>
</div>
<div class="bg-white dark:bg-gray-800 border-2 border-teal-100 dark:border-teal-800 rounded-xl p-4">
          <div class="flex justify-between items-center mb-3 flex-wrap gap-2">
            <h4 class="font-bold dark:text-white">📋 Course List <span id="acCourseCount" class="text-xs text-gray-400 num-display"></span></h4>
            <select id="acFilterCategory" onchange="renderAcademicCourseList()" class="border-2 rounded-lg p-2 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600">
              <option value="">All Categories</option><option>Higher Secondary</option><option>Honours</option><option>Masters</option>
            </select>
          </div>
          <div id="acCourseList"></div>
        </div>
        </div>

        <div id="acPaneExams" class="hidden space-y-4">
          <div class="bg-teal-50 dark:bg-teal-900/30 p-4 rounded-xl max-w-lg">
            <h4 class="font-bold text-sm mb-1 dark:text-white">➕ Add Exam Type</h4>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">This list is used in Marks Entry and Reports. (Exam Schedule will use it too.)</p>
            <input id="etName" maxlength="60" placeholder="Exam name (e.g., Model Test)" class="w-full border-2 rounded-xl p-3 mb-2 dark:bg-gray-700 dark:text-white dark:border-gray-600">
            <div class="flex gap-2 mb-2 items-center">
              <input id="etMinutes" type="number" min="5" max="600" step="5" value="45" class="border-2 rounded-xl p-3 w-28 dark:bg-gray-700 dark:text-white dark:border-gray-600">
              <span class="text-sm text-gray-600 dark:text-gray-300">minutes (default duration)</span>
            </div>
            <label class="flex items-center gap-2 text-sm mb-3 dark:text-white"><input id="etTotal" type="checkbox" class="w-4 h-4"> Counts in course Total (in-course marks)</label>
            <button onclick="addExamType()" class="bg-teal-600 text-white px-6 py-3 rounded-xl font-bold btn-pop w-full">Save</button>
          </div>
          <div class="bg-white dark:bg-gray-800 border-2 border-teal-100 dark:border-teal-800 rounded-xl p-4">
            <h4 class="font-bold mb-3 dark:text-white">📝 Exam Types <span id="etCount" class="text-xs text-gray-400 num-display"></span></h4>
            <div id="etList"></div>
          </div>
        </div>
      </div>`;
    acFillYears('acCategory', 'acYear');
    loadAcademicCourseList();
  }
  else if (tab === 'manageStudent') {
    el.innerHTML = `
      ${sessionDatalist}
      <div class="space-y-4">
        <h3 class="text-lg font-bold dark:text-white">🎓 Student Management</h3>
        <div class="flex gap-2 flex-wrap text-xs">
          <button data-student-subtab="addExcel" onclick="showStudentSubTab('addExcel')" class="admin-subtab active">📂 Excel</button>
          <button data-student-subtab="addManual" onclick="showStudentSubTab('addManual')" class="admin-subtab">✍️ Manual</button>
          <button data-student-subtab="list" onclick="showStudentSubTab('list')" class="admin-subtab">📋 List</button>
          <button data-student-subtab="bulkUpdate" onclick="showStudentSubTab('bulkUpdate')" class="admin-subtab">🔄 Bulk</button>
<button data-student-subtab="promote" onclick="showStudentSubTab('promote')" class="admin-subtab">⬆️ Promote</button>
        </div>
        <div id="studentSubContent"></div>
      </div>`;
    showStudentSubTab('addExcel');
  }
  else if (tab === 'mapCourse') {
    el.innerHTML = `
      ${sessionDatalist}
      <div class="space-y-4 max-w-lg">
        <h3 class="text-lg font-bold dark:text-white">🔗 Teacher-Course & Routine Mapping</h3>
<p class="text-xs text-gray-500 dark:text-gray-400">Mapping is by class (year). Session is not needed here.</p>
        <select id="mapTeacher" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600"><option value="">Select teacher</option></select>
        <select id="mapCategory" onchange="mapFillYears()" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600"><option value="">Select category</option><option>Higher Secondary</option><option>Honours</option><option>Masters</option></select>
<select id="mapYearName" onchange="mapLoadCourses()" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600"><option value="">Select year</option></select>
        <select id="mapCourseSelect" onchange="fillCourseDetails()" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600"><option value="">Select course</option></select>
        <input id="mapCourse" placeholder="Course code" readonly class="w-full border-2 rounded-xl p-3 bg-gray-100 dark:bg-gray-600 dark:text-white dark:border-gray-600">
        <input id="mapCourseName" placeholder="Course name" readonly class="w-full border-2 rounded-xl p-3 bg-gray-100 dark:bg-gray-600 dark:text-white dark:border-gray-600">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs font-bold mb-1 dark:text-white">Day</label>
            <select id="mapDay" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600">
              <option value="">Day</option><option>Sunday</option><option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold mb-1 dark:text-white">Time</label>
            <select id="mapTime" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600">
              <option value="">Time</option>${ROUTINE_TIME_ORDER.map(t => `<option>${t}</option>`).join('')}
            </select>
          </div>
          <div class="col-span-2">
            <label class="block text-xs font-bold mb-1 dark:text-white">Room No. <span class="font-normal text-gray-400">(optional, e.g. ECO-1, 101)</span></label>
            <input id="mapRoom" maxlength="20" placeholder="Room number" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600 uppercase">
          </div>
        </div>
        <button onclick="saveMapping()" class="bg-cyan-600 text-white px-6 py-3 rounded-xl font-bold btn-pop w-full mt-2">Save</button>
        </div>
      <div class="mt-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <h4 class="font-bold text-gray-800 dark:text-white">All mappings <span id="mapCount" class="text-xs font-semibold text-gray-400"></span></h4>
          <input id="mapSearch" oninput="renderMappings()" placeholder="Search teacher, course, day..." class="w-full sm:w-72 border-2 rounded-xl p-2.5 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600">
        </div>
        <div id="mappingList"></div>
      </div>`;
    loadTeachersDropdown();
    loadAcademicCoursesForMap();
    loadMappings();
  }
  else if (tab === 'routine') {
    el.innerHTML = `
      ${sessionDatalist}
      <div class="space-y-4">
        <div>
          <h3 class="text-lg font-bold dark:text-white">📅 Class Routine</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">💡 Auto-generated from mappings — Edit/Delete updates instantly</p>
        </div>

        <div class="bg-purple-50 dark:bg-purple-900/30 border-2 border-purple-200 dark:border-purple-700 p-4 rounded-xl space-y-3">
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
<div>
<label class="block text-xs font-bold mb-1 dark:text-white">Day</label>
              <select id="rvDay" class="w-full border-2 rounded-xl p-2 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600">
                <option value="">All days</option>
                <option>Sunday</option><option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold mb-1 dark:text-white">Year</label>
              ${classPickerHtml('rvYear', { allCats: true, placeholder: 'All years', cls: 'w-full border-2 rounded-xl p-2 text-sm mb-1 dark:bg-gray-700 dark:text-white dark:border-gray-600' })}
            </div>
            
            <div>
              <label class="block text-xs font-bold mb-1 dark:text-white">Teacher</label>
              <select id="rvTeacher" class="w-full border-2 rounded-xl p-2 text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600">
                <option value="">All teachers</option>
              </select>
            </div>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button onclick="loadRoutineViewer()" class="flex-1 bg-purple-600 text-white px-4 py-2.5 rounded-xl font-bold btn-pop">🔍 View</button>
            <button onclick="exportRoutineExcel()" class="bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold btn-pop">📊 Excel</button>
            <button onclick="exportRoutinePDF()" class="bg-red-600 text-white px-4 py-2.5 rounded-xl font-bold btn-pop">📄 PDF</button>
          </div>
        </div>

        <div id="routineViewerArea"></div>
      </div>`;

    await loadRoutineTeachers();
    loadRoutineViewer();
  }
  else if (tab === 'reports') {
    el.innerHTML = `
      ${sessionDatalist}
      <div class="space-y-4">
        <h3 class="text-lg font-bold dark:text-white">📊 Reports</h3>
        <div class="flex gap-2 flex-wrap text-xs">
          <button data-report-subtab="attendance" onclick="showReportTab('attendance')" class="admin-subtab active">📋 Attendance</button>
          <button data-report-subtab="gps" onclick="showReportTab('gps')" class="admin-subtab">📍 GPS Tracking</button>
          <button data-report-subtab="exam" onclick="showReportTab('exam')" class="admin-subtab">📝 Marks</button>
          <button data-report-subtab="individual" onclick="showReportTab('individual')" class="admin-subtab">🎓 Individual</button>
          <button data-report-subtab="examwise" onclick="showReportTab('examwise')" class="admin-subtab">🏆 Exam Result</button>
        </div>
        <div id="reportContent"></div>
      </div>`;
    showReportTab('attendance');
  }
  else if (tab === 'notice') {
    el.innerHTML = `
      <div class="space-y-4 max-w-lg">
        <h3 class="text-lg font-bold dark:text-white">📢 Notice Board</h3>
        <input id="nTitle" placeholder="Title" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600">
        <textarea id="nContent" placeholder="Content" rows="3" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600"></textarea>
        <select id="nPriority" class="w-full border-2 rounded-xl p-3 dark:bg-gray-700 dark:text-white dark:border-gray-600"><option value="normal">Normal</option><option value="urgent">🚨 Urgent</option></select>
        <button onclick="addNotice()" class="bg-pink-600 text-white px-6 py-3 rounded-xl font-bold btn-pop w-full">Publish</button>
        <div id="noticeAdminList" class="mt-4 space-y-2"></div>
      </div>`;
    loadNoticesAdmin();
  }
  else if (tab === 'backup') {
    el.innerHTML = `
      <div class="space-y-4 max-w-2xl">
        <h3 class="text-lg font-bold dark:text-white">💾 Backup & Restore</h3>
        <div class="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-xl">
          <h4 class="font-bold mb-3 dark:text-white">📥 Full Backup (JSON)</h4>
          <p class="text-xs text-gray-600 dark:text-gray-300 mb-3">All tables will be downloaded.</p>
          <button onclick="downloadFullBackup()" class="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold btn-pop w-full">📥 Backup Download</button>
        </div>
        <div class="bg-red-50 dark:bg-red-900/30 p-4 rounded-xl">
          <h4 class="font-bold mb-3 text-red-700 dark:text-red-300">📤 Restore (⚠️ Caution)</h4>
          <p class="text-xs text-red-700 dark:text-red-300 mb-3">All current data will be erased!</p>
          <input type="file" id="restoreFile" accept=".json" class="w-full text-sm mb-3 dark:text-white">
          <button onclick="restoreFromBackup()" class="bg-red-600 text-white px-6 py-3 rounded-xl font-bold btn-pop w-full">📤 Restore</button>
        </div>
        <div id="backupStatus" class="text-sm"></div>
      </div>`;
  }
}

// ============================================================
// NOTICE ADMIN
// ============================================================
async function addNotice() {
  const title = document.getElementById('nTitle').value.trim();
  const content = document.getElementById('nContent').value.trim();
  const priority = document.getElementById('nPriority').value;
  if (!title || !content) return toastWarning('Fill all fields');
  const { error } = await db.from('notices').insert({ title, content, priority });
  if (error) return toastError(error.message);
  toastSuccess('Notice published');
  document.getElementById('nTitle').value = '';
  document.getElementById('nContent').value = '';
  loadNoticesAdmin();
}

async function loadNoticesAdmin() {
  const { data } = await db.from('notices').select('*').order('created_at', { ascending: false }).limit(20);
  document.getElementById('noticeAdminList').innerHTML = data?.map(n => `<div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl"><b class="dark:text-white">${n.priority === 'urgent' ? '🚨 ' : ''}${escapeHtml(n.title)}</b><p class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(n.content)}</p></div>`).join('') || '';
}
