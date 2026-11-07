/* Mobile navigation: close on outside click or Escape. */
function closeMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  const toggle = document.getElementById('mobileMenuToggle');
  if (menu) menu.classList.add('hidden');
  if (toggle) { toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open navigation menu'); }
}
function toggleMobileMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('mobileMenu');
  const toggle = document.getElementById('mobileMenuToggle');
  if (!menu) return;
  const opening = menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !opening);
  if (toggle) { toggle.setAttribute('aria-expanded', String(opening)); toggle.setAttribute('aria-label', opening ? 'Close navigation menu' : 'Open navigation menu'); }
}
document.addEventListener('click', event => {
  const menu = document.getElementById('mobileMenu');
  const toggle = document.getElementById('mobileMenuToggle');
  if (menu && !menu.classList.contains('hidden') && !menu.contains(event.target) && !toggle?.contains(event.target)) closeMobileMenu();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMobileMenu(); });

/* js/app.js — অ্যাপ চালু (INIT) + Service Worker রেজিস্টার */
// ============================================================
// INIT
// ============================================================
(async () => {
  updateThemeIcon();
  updateSortModeBtn();
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


// A page restored from the browser back-forward cache must not revive an admin view.
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    db.auth.signOut({ scope: 'local' }).finally(() => showSection('home'));
  }
});
