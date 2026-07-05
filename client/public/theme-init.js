// Set the theme before first paint so dark-mode users never see a flash of
// the light palette. Mirrors the effect in AppContext; same localStorage key.
// Lives as an external file (not inline in index.html) so the CSP served by
// the API can stay `script-src 'self'` with no inline-script hash to maintain.
(function () {
  try {
    var dark = JSON.parse(localStorage.getItem('darkMode') || 'false');
    var mode = dark === true ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.style.colorScheme = mode;
  } catch (e) {}
})();
