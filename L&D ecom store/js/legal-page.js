(function () {
  const LS = 'atelier-locale';
  function getLocale() {
    return localStorage.getItem(LS) || 'fr';
  }
  function setLocale(loc) {
    localStorage.setItem(LS, loc);
  }
  function apply() {
    const locale = getLocale();
    document.documentElement.lang = locale;
    document.querySelectorAll('[data-lang-show]').forEach(function (el) {
      const show = el.getAttribute('data-lang-show') === locale;
      el.classList.toggle('hidden', !show);
    });
    const btn = document.getElementById('legal-locale-toggle');
    if (btn) btn.textContent = locale === 'fr' ? 'EN' : 'FR';
  }
  window.legalToggleLocale = function () {
    setLocale(getLocale() === 'fr' ? 'en' : 'fr');
    apply();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
