/* seminar-hooks.js — non-invasive wiring for Teacher Seminar tab */
(function () {
  const _orig = typeof showTeacherTab === 'function' ? showTeacherTab : null;
  if (!_orig) return;
  window.showTeacherTab = async function (tab) {
    if (tab === 'seminar') {
      const el = document.getElementById('teacherContent');
      if (typeof smnTeacherOpen === 'function') smnTeacherOpen(el);
      else if (el) el.innerHTML = '<div class="text-center py-8 text-red-500">Seminar could not load. Please refresh.</div>';
      return;
    }
    return _orig.apply(this, arguments);
  };
})();
