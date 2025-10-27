// tiny include helper to load header/footer partials
async function loadPartial(selector, url) {
  const el = document.querySelector(selector);
  if (!el) return;
  try {
    const res = await fetch(url);
    el.innerHTML = await res.text();
  } catch (e) {
    console.error('failed to load partial', url, e);
  }
}
document.addEventListener('DOMContentLoaded', () => {
  loadPartial('#site-header', '/partials/header.html');
  loadPartial('#site-footer', '/partials/footer.html');
});
