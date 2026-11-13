// Marketplace: Erstausstattung, Rad-Berater und Verzeichnis der wichtigsten Hersteller, Bekleidungsmarken und Händler.
// Verlinkt wird jeweils die Startseite. Aktuelle Angebote lassen sich ohne eigene
// Server-Anbindung (Partnerprogramme/Produktfeeds) nicht automatisch anzeigen.

const GROUPS = [
  { title: 'Räder', text: 'Hersteller und Direktversender', items: [
    ['Canyon', 'Direktversand · Rennrad, Gravel, Triathlon', 'canyon.com'],
    ['Specialized', 'Tarmac, Roubaix, Diverge', 'specialized.com'],
    ['Cervélo', 'S5, Soloist, P5', 'cervelo.com'],
    ['Trek', 'Madone, Domane, Checkpoint', 'trekbikes.com'],
    ['Rose', 'Direktversand · Xlite, Reveal, Backroad', 'rosebikes.de'],
    ['Cube', 'Litening, Agree, Nuroad', 'cube.eu'],
    ['Giant', 'Propel, TCR, Defy', 'giant-bicycles.com'],
    ['Scott', 'Foil, Addict, Plasma', 'scott-sports.com'],
    ['BMC', 'Teammachine, Roadmachine', 'bmc-switzerland.com'],
    ['Pinarello', 'Dogma', 'pinarello.com'],
  ] },
  { title: 'Bekleidung', text: 'Trikots, Hosen, Accessoires', items: [
    ['Pas Normal Studios', 'Kopenhagen', 'pasnormalstudios.com'],
    ['Ryzon', 'Köln', 'ryzon.net'],
    ['Rapha', 'London', 'rapha.cc'],
    ['MAAP', 'Melbourne', 'maap.cc'],
    ['Castelli', 'Italien', 'castelli-cycling.com'],
    ['Assos', 'Schweiz', 'assos.com'],
    ['Gorewear', 'Wetterschutz', 'gorewear.com'],
  ] },
  { title: 'Indoor & Technik', text: 'Smart Trainer, Sensoren, Radcomputer', items: [
    ['Wahoo', 'Kickr, Kickr Core, Elemnt', 'wahoofitness.com'],
    ['Garmin', 'Tacx-Trainer, Edge, Sensoren', 'garmin.com'],
    ['Elite', 'Direto, Suito, Justo', 'elite-it.com'],
  ] },
  { title: 'Händler', text: 'Teile, Zubehör und Angebote vieler Marken', items: [
    ['bike-components', 'Aachen', 'bike-components.de'],
    ['Bike24', 'Dresden', 'bike24.de'],
    ['Bike-Discount', 'Bonn', 'bike-discount.de'],
    ['R2-Bike', 'Dresden', 'r2-bike.com'],
  ] },
];

import { BRANDS, CATEGORIES } from './bikes.js?v=11';

const STARTER_KEY = 'rollentrainer.starter.v1';
const DOMAIN = { Canyon: 'canyon.com', 'Cervélo': 'cervelo.com', Specialized: 'specialized.com', Trek: 'trekbikes.com', Giant: 'giant-bicycles.com',
  Scott: 'scott-sports.com', Cube: 'cube.eu', Rose: 'rosebikes.de', BMC: 'bmc-switzerland.com', Pinarello: 'pinarello.com' };

// Erstausstattung: [id, Name, Erklärung]
export const KIT = [
  { title: 'Unverzichtbar', items: [
    ['helm', 'Helm', 'Das eine Teil, an dem du nicht sparst. Er muss fest sitzen, ohne zu drücken.'],
    ['hose', 'Radhose mit Sitzpolster', 'Eine Trägerhose verrutscht nicht. Sie wird ohne Unterwäsche getragen.'],
    ['flasche', 'Trinkflasche und Halter', 'Auf der Rolle schwitzt du mehr als draußen – ohne Flasche geht es nicht.'],
    ['panne', 'Pannenset', 'Ersatzschlauch, Reifenheber und Minipumpe für die erste Ausfahrt draußen.'],
    ['licht', 'Licht', 'Vorn und hinten, sobald du in der Dämmerung fährst.'],
  ] },
  { title: 'Bald sinnvoll', items: [
    ['trikot', 'Trikot', 'Liegt eng an, transportiert Schweiß und hat Rückentaschen.'],
    ['pedale', 'Klickpedale und Radschuhe', 'Fester Stand und runderer Tritt. Das Ausklicken ein paar Mal im Stand üben.'],
    ['handschuhe', 'Handschuhe und Brille', 'Schutz bei Stürzen, gegen Fahrtwind und Insekten.'],
    ['computer', 'Radcomputer oder Handyhalter', 'Für Navigation und um Tempo und Strecke zu sehen.'],
  ] },
  { title: 'Für die Rolle', items: [
    ['trainer', 'Smart Trainer', 'Stellt den Widerstand selbst ein – Voraussetzung für die Workouts in dieser App.'],
    ['ventilator', 'Ventilator', 'Macht drinnen den größten Unterschied: ohne Fahrtwind überhitzt du schnell.'],
    ['matte', 'Matte und Handtuch', 'Schützt Boden und Rad vor Schweiß.'],
  ] },
];

const USES = [
  ['endurance', 'Lange, entspannte Touren', 'Ein Endurance-Rennrad sitzt aufrechter und dämpft besser. Für die meisten Einsteiger die beste Wahl.'],
  ['allround', 'Sportlich und zügig', 'Ein Allround-Rennrad ist leicht und direkt, ohne extreme Sitzposition.'],
  ['gravel', 'Auch Schotter und Waldwege', 'Ein Gravelbike fährt auf Asphalt fast wie ein Rennrad und kommt mit breiten Reifen überall durch.'],
  ['aero', 'Tempo und Rennen', 'Ein Aero-Rennrad ist auf Geschwindigkeit gebaut und verlangt eine tiefe Sitzposition. Als erstes Rad eher anspruchsvoll.'],
];
const BUDGETS = [
  ['low', 'bis 1.500 €', 'In diesem Bereich findest du solide Einsteigerräder, meist mit Aluminiumrahmen. Ein gepflegtes Gebrauchtrad ist oft die bessere Wahl. Rechne zusätzlich mit Geld für Helm, Hose, Pedale und Schuhe.'],
  ['mid', '1.500 – 3.000 €', 'Hier beginnen Carbonrahmen und hochwertigere Schaltungen. Für die meisten Einsteiger ist das mehr als genug Rad.'],
  ['high', 'über 3.000 €', 'Ab hier zahlst du vor allem für weniger Gewicht, Aerodynamik und elektronische Schaltung. Schneller macht dich am Anfang vor allem das Training.'],
];

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const load = () => { try { return { checked: {}, use: null, budget: null, ...JSON.parse(localStorage.getItem(STARTER_KEY)) }; } catch { return { checked: {}, use: null, budget: null }; } };
const save = (st) => { try { localStorage.setItem(STARTER_KEY, JSON.stringify(st)); } catch { /* optional */ } };

function advisor(st) {
  const sec = el('section', 'card');
  sec.id = 'berater';
  const step = el('div', 'step');
  step.append(el('span', null, '1'), el('h2', null, 'Welches Rad passt zu dir?'));
  const out = el('div', 'advice');
  const seg = (label, options, key) => {
    const wrap = el('div');
    wrap.append(el('label', 'lbl', label));
    const box = el('div', 'seg seg4');
    for (const [value, text] of options) {
      const b = el('button', null, text);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(st[key] === value));
      b.onclick = () => { st[key] = value; save(st); for (const x of box.children) x.setAttribute('aria-pressed', String(x === b)); result(); };
      box.append(b);
    }
    wrap.append(box);
    return wrap;
  };
  function result() {
    out.replaceChildren();
    const use = USES.find((u) => u[0] === st.use), budget = BUDGETS.find((b) => b[0] === st.budget);
    if (!use) { out.append(el('p', 'hint', 'Wähle aus, wofür du das Rad vor allem nutzen willst.')); return; }
    out.append(el('div', 'eyebrow', 'Unsere Empfehlung'), el('h3', null, CATEGORIES[use[0]].label), el('p', null, use[2]));
    if (budget) out.append(el('p', null, budget[2]));
    out.append(el('label', 'lbl', 'Modelle dieser Kategorie'));
    const grid = el('div', 'mgrid');
    for (const [brand, list] of Object.entries(BRANDS)) {
      const hit = list.find((x) => x.cat === use[0]);
      if (!hit) continue;
      const a = el('a', 'mtile');
      a.href = `https://www.${DOMAIN[brand]}/`; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.append(el('b', null, `${brand} ${hit.model}`), el('i', null, `${DOMAIN[brand]} ↗`));
      grid.append(a);
    }
    out.append(grid, el('p', 'hint', 'Die Rahmengröße bestimmst du am sichersten mit dem Größenrechner des Herstellers oder bei einer Probefahrt. Sitzt du später nicht bequem, hilft der Bike-Fitting-Check.'));
  }
  sec.append(step, seg('Wofür willst du fahren?', USES, 'use'), seg('Dein Budget für das Rad', BUDGETS, 'budget'), out);
  result();
  return sec;
}

function checklist(st) {
  const sec = el('section', 'card');
  sec.id = 'ausstattung';
  const step = el('div', 'step');
  step.append(el('span', null, '2'), el('h2', null, 'Deine Erstausstattung'));
  const count = el('p', 'hint');
  const total = KIT.reduce((n, g) => n + g.items.length, 0);
  const update = () => { count.textContent = `${Object.values(st.checked).filter(Boolean).length} von ${total} abgehakt. Hake ab, was du schon hast.`; };
  sec.append(step, count);
  for (const g of KIT) {
    sec.append(el('label', 'lbl', g.title));
    for (const [id, name, text] of g.items) {
      const row = el('label', 'check');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = !!st.checked[id];
      box.onchange = () => { st.checked[id] = box.checked; save(st); update(); };
      const body = el('span');
      body.append(el('b', null, name), el('small', null, text));
      row.append(box, body);
      sec.append(row);
    }
  }
  update();
  return sec;
}

export function renderMarket(root) {
  const st = load();
  const head = el('header', 'brand');
  head.append(el('span', 'brandname', 'Sitzcheck'), el('span', 'brandtag', 'Marketplace'));
  const intro = el('div', 'pagehead');
  intro.append(el('h1', null, 'Rad und Ausrüstung'),
    el('p', null, 'Was du für den Einstieg brauchst, welches Rad zu dir passt und wo du es findest.'));
  root.replaceChildren(head, intro, advisor(st), checklist(st));
  const dir = el('div', 'step dirhead');
  dir.id = 'marken';
  dir.append(el('span', null, '3'), el('h2', null, 'Marken und Händler'));
  root.append(dir, el('p', 'hint', 'Ein Tipp öffnet die Seite des Anbieters in einem neuen Tab.'));
  for (const g of GROUPS) {
    const sec = el('section', 'mgroup');
    const h = el('div', 'group');
    h.append(g.title, el('small', null, g.text));
    const grid = el('div', 'mgrid');
    for (const [name, sub, domain] of g.items) {
      const a = el('a', 'mtile');
      a.href = `https://www.${domain}/`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.append(el('b', null, name), el('span', null, sub), el('i', null, `${domain} ↗`));
      grid.append(a);
    }
    sec.append(h, grid);
    root.append(sec);
  }
  root.append(el('p', 'note', 'Sitzcheck ist mit keinem der Anbieter verbunden und erhält keine Provision. Verlinkt ist jeweils die Startseite; Preise und tagesaktuelle Angebote werden hier nicht abgerufen. Die Budget-Hinweise sind grobe Orientierung.'));
}
