// Menüleiste: wechselt zwischen Training, Bike-Fitting und Marketplace.
// Die Bereiche werden einzeln geladen, damit ein Fehler in einem die anderen nicht mitreißt.

const SECTIONS = ['start', 'training', 'fitting', 'markt'];
const links = [...document.querySelectorAll('.rail a[data-sec]')];


function go() {
  const want = location.hash.slice(1);
  const sec = SECTIONS.includes(want) ? want : 'start';
  for (const s of SECTIONS) document.getElementById(`sec-${s}`).hidden = s !== sec;
  for (const a of links) a.setAttribute('aria-current', a.dataset.sec === sec ? 'page' : 'false');
  window.scrollTo(0, 0);
  // Startseite bei jedem Besuch neu aufbauen, damit „Zuletzt“ aktuell ist
  if (sec === 'start') import('./start.js?v=13').then((m) => m.renderStart(document.getElementById('start')));
}
addEventListener('hashchange', go);
go();

import('./training.js?v=13').then((m) => m.initTraining(document.getElementById('training')));
import('./market.js?v=13').then((m) => m.renderMarket(document.getElementById('market')));

// Menüleiste ein- und ausblenden
const MENU_KEY = 'rollentrainer.menu.v1';
const toggle = document.getElementById('railToggle');
function setMenu(open) {
  document.body.classList.toggle('norail', !open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Menü ausblenden' : 'Menü einblenden');
  toggle.textContent = open ? '‹ Menü' : '☰';
  try { localStorage.setItem(MENU_KEY, open ? '1' : '0'); } catch { /* optional */ }
}
toggle.onclick = () => setMenu(document.body.classList.contains('norail'));
let saved = null;
try { saved = localStorage.getItem(MENU_KEY); } catch { /* optional */ }
setMenu(saved !== '0');
