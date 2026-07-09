// Runs before first paint to avoid a flash of the wrong palette. External
// file (not inline) so the API's CSP can stay `script-src 'self'`.
(function () {
  try {
    var stored = localStorage.getItem('darkMode');
    var dark = stored !== null
      ? JSON.parse(stored) === true
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var mode = dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.style.colorScheme = mode;
  } catch (e) {}
})();
