/* js/app.js — অ্যাপ চালু (INIT) + Service Worker রেজিস্টার */
// ============================================================
// INIT
// ============================================================
(async () => {
  updateThemeIcon();
  updateOnlineStatus();
  setInterval(updateOnlineStatus, 30000);

  if (navigator.connection) {
    navigator.connection.addEventListener('change', updateNetworkBanner);
  }

  loadPublicNotices();
  setupPinBoxes();

  const { data: { session } } = await db.auth.getSession();
  if (session) {
    const { data: t } = await db.from('teachers').select('is_admin').eq('auth_user_id', session.user.id).maybeSingle();
    if (t?.is_admin) { showSection('adminDashboard'); loadAdminDashboardStats(); showAdminTab('manageTeacher'); }
  }
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('✅ Service Worker registered:', reg.scope))
      .catch(err => console.log('❌ SW error:', err));
  });
}
