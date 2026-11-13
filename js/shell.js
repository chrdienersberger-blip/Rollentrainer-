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
  if (sec === 'start') import('./start.js?v=10').then((m) => m.renderStart(document.getElementById('start')));
}
addEventListener('hashchange', go);
go();

import('./training.js?v=10').then((m) => m.initTraining(document.getElementById('training')));
import('./market.js?v=10').then((m) => m.renderMarket(document.getElementById('market')));
