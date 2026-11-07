// Keep local development and previews out of production Web Analytics.
(function () {
  if (window.location.origin !== 'https://royaledecklab.com') return;
  // Cloudflare can also insert the beacon automatically at the edge.
  if (document.querySelector('script[data-cf-beacon]')) return;

  var beacon = document.createElement('script');
  beacon.type = 'module';
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.dataset.cfBeacon = JSON.stringify({ token: '449f9e22270042b08cac7a2a0806036b' });
  document.head.appendChild(beacon);
})();
