'use strict';

const body = document.body;
const navigation = document.querySelector('.navigation');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const mobileApply = document.querySelector('.mobile-apply');
const hero = document.querySelector('.hero');
const info = document.querySelector('#info');
const closing = document.querySelector('.closing');
// Navigation arrives after the opening scene.
let updatePending = false;
function updateNavigation() {
  const pastHero = hero.getBoundingClientRect().bottom < 80;
  navigation.classList.toggle('is-visible', pastHero);
  body.classList.toggle('has-navigation', pastHero);
  const infoBounds = info.getBoundingClientRect();
  const closingBounds = closing.getBoundingClientRect();
  const infoOnScreen = infoBounds.top < innerHeight * .8 && infoBounds.bottom > 80;
  const closingOnScreen = closingBounds.top < innerHeight * .8;
  const showApply = pastHero && !infoOnScreen && !closingOnScreen;
  mobileApply.classList.toggle('is-visible', showApply);
  body.classList.toggle('has-mobile-apply', showApply);
  updatePending = false;
}
function scheduleNavigation() {
  if (!updatePending) { requestAnimationFrame(updateNavigation); updatePending = true; }
}
window.addEventListener('scroll', scheduleNavigation, { passive: true });
window.addEventListener('resize', scheduleNavigation, { passive: true });
updateNavigation();

if ('IntersectionObserver' in window) {
  const sceneObserver = new IntersectionObserver(entries => {
    for (const entry of entries) entry.target.classList.toggle('is-offscreen', !entry.isIntersecting);
  }, { rootMargin: '120px' });
  document.querySelectorAll('.scene').forEach(scene => sceneObserver.observe(scene));
  const sectionLinks = [...navigation.querySelectorAll('nav a')];
  const activeObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      sectionLinks.forEach(link => {
        if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-15% 0px -60% 0px' });
  document.querySelectorAll('main>section[id]').forEach(section => activeObserver.observe(section));
}
document.addEventListener('visibilitychange', () => body.classList.toggle('page-hidden', document.hidden));

const box = document.querySelector('.box-trigger');
box.addEventListener('click', () => {
  if (reduceMotion.matches || box.classList.contains('is-lit')) return;
  box.classList.add('is-lit');
  window.setTimeout(() => box.classList.remove('is-lit'), 950);
});

let toastTimeout;
function showToast(message) {
  const toast = document.querySelector('.toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('is-visible'), 3200);
}
document.querySelector('.copy-address').addEventListener('click', async () => {
  const address = document.querySelector('#venue-address');
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(address.textContent.trim());
    showToast('주소를 복사했습니다.');
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(address);
    selection.removeAllRanges();
    selection.addRange(range);
    showToast('선택된 주소를 길게 누르거나 복사해 주세요.');
  }
});

// SVG source images are loaded as their scenes approach the viewport.
// Every lazy SVG has a noscript copy so the original lettering works without JS.
function loadArtwork(container) {
  container.querySelectorAll('image[data-href]').forEach(image => {
    image.setAttribute('href', image.dataset.href);
    image.removeAttribute('data-href');
  });
}
if ('IntersectionObserver' in window) {
  const artworkObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        loadArtwork(entry.target);
        artworkObserver.unobserve(entry.target);
      }
    });
  }, { rootMargin: '800px' });
  document.querySelectorAll('.lazy-art').forEach(svg => artworkObserver.observe(svg));
} else {
  loadArtwork(document);
}
window.addEventListener('beforeprint', () => loadArtwork(document));

