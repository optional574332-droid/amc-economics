/* js/auth.js — Admin লগইন + লগআউট */
// ============================================================
// ADMIN LOGIN
// ============================================================
async function adminLogin() {
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPass').value;
  const errEl = document.getElementById('adminErr');
  errEl.textContent = '';
  setLoginButtonLoading('adminLoginBtn', true);
  showGlobalLoader();
  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) { document.getElementById('adminErr').textContent = 'Invalid email or password'; return; }
    const { data: t } = await db.from('teachers').select('is_admin').eq('auth_user_id', data.user.id).maybeSingle();
    if (!t || !t.is_admin) {
      await db.auth.signOut();
      document.getElementById('adminErr').textContent = 'You are not an admin';
      return;
    }
    showSection('adminDashboard');
    loadAdminDashboardStats();
    showAdminTab('manageTeacher');
    toastSuccess('Admin login successful');
  } catch (e) {
    console.error('Admin login error:', e);
    errEl.textContent = 'Login failed. Check your connection and try again.';
  } finally {
    hideGlobalLoader();
    setLoginButtonLoading('adminLoginBtn', false);
  }
}

async function logout() {
  if (pinTimerInterval) { clearInterval(pinTimerInterval); pinTimerInterval = null; }
  if (activeSessionCheckInterval) { clearInterval(activeSessionCheckInterval); activeSessionCheckInterval = null; }
  if (liveReportInterval) { clearInterval(liveReportInterval); liveReportInterval = null; }
  if (scheduledBannerInterval) { clearInterval(scheduledBannerInterval); scheduledBannerInterval = null; }
  const sBanner = document.getElementById('scheduledClassBannerContainer'); if (sBanner) sBanner.innerHTML = '';
  await db.auth.signOut();
  currentTeacher = null; currentStudent = null;
  currentRoutineData = null; currentRoutineContext = null;
  try {
    Object.keys(localStorage).filter(k => k.startsWith('amc_students_')).forEach(k => localStorage.removeItem(k));
  } catch (e) {}
  if (liveChannel) { await db.removeChannel(liveChannel); liveChannel = null; }
  showSection('home');
  toastInfo('Logged out');
}
