// Marketplace: Verzeichnis der wichtigsten Hersteller, Bekleidungsmarken und Händler.
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

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function renderMarket(root) {
  const head = el('header', 'brand');
  head.append(el('span', 'brandname', 'Sitzcheck'), el('span', 'brandtag', 'Marketplace'));
  const intro = el('div', 'pagehead');
  intro.append(el('h1', null, 'Marken und Händler'),
    el('p', null, 'Die wichtigsten Adressen rund ums Rennrad. Ein Tipp öffnet die Seite des Anbieters in einem neuen Tab.'));
  root.replaceChildren(head, intro);
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
  root.append(el('p', 'note', 'Sitzcheck ist mit keinem der Anbieter verbunden und erhält keine Provision. Verlinkt ist jeweils die Startseite; tagesaktuelle Angebote werden hier nicht abgerufen.'));
}
