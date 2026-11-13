// Menüleiste: wechselt zwischen Training, Bike-Fitting und Marketplace.
// Die Bereiche werden einzeln geladen, damit ein Fehler in einem die anderen nicht mitreißt.

const SECTIONS = ['training', 'fitting', 'markt'];
const links = [...document.querySelectorAll('.rail a')];

function go() {
  const want = location.hash.slice(1);
  const sec = SECTIONS.includes(want) ? want : 'training';
  for (const s of SECTIONS) document.getElementById(`sec-${s}`).hidden = s !== sec;
  for (const a of links) a.setAttribute('aria-current', a.dataset.sec === sec ? 'page' : 'false');
  window.scrollTo(0, 0);
}
addEventListener('hashchange', go);
go();

import('./training.js?v=9').then((m) => m.initTraining(document.getElementById('training')));
import('./market.js?v=9').then((m) => m.renderMarket(document.getElementById('market')));
