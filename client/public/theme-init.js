// Set the theme before first paint so dark-mode users never see a flash of
// the light palette. Mirrors the effect in AppContext; same localStorage key.
// Lives as an external file (not inline in index.html) so the CSP served by
// the API can stay `script-src 'self'` with no inline-script hash to maintain.
(function () {
  try {
    var stored = localStorage.getItem('darkMode');
    // No saved choice: follow the OS. A saved choice always wins.
    var dark = stored !== null
      ? JSON.parse(stored) === true
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var mode = dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.style.colorScheme = mode;
  } catch (e) {}
})();
