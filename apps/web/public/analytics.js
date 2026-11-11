(() => {
  const id = document.querySelector('meta[name="ga-measurement-id"]')?.content;
  if (!/^G-[A-Z0-9]+$/.test(id || '')) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id, { send_page_view: false });
})();
