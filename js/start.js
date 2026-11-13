// Startseite: Überblick über die drei Bereiche, mit gezeichneten Grafiken.

import { initHero } from './hero.js?v=10';
import { findBike } from './bikes.js?v=10';
import { WORKOUTS, ROUTES, workoutDuration, routeLength } from './workouts.js?v=10';

const SVGNS = 'http://www.w3.org/2000/svg';
const INK = '#111110', PANEL = '#e4dfd5', MUTED = '#77736b', ACCENT = '#a8553a', GRID = '#d3cdc1';
const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const svgEl = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
};
const read = (key) => { try { return JSON.parse(localStorage.getItem(key)) ?? []; } catch { return []; } };

/** Großes Titelbild: Höhenprofil des Passanstiegs als Linienzeichnung. */
function mountain() {
  const W = 400, H = 250, route = ROUTES.find((r) => r.id === 'pass'), total = routeLength(route);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'art', role: 'img', 'aria-label': 'Zeichnung: Höhenprofil eines Passanstiegs mit Kilometermarken' });
  svgEl('rect', { width: W, height: H, fill: PANEL }, svg);
  for (let y = 30; y < H; y += 30) svgEl('line', { x1: 0, x2: W, y1: y, y2: y, stroke: GRID, 'stroke-width': 0.6 }, svg);
  const x = (km) => 24 + (km * 1000 / total) * (W - 48), y = (e) => H - 44 - ((e - 780) / 620) * (H - 96);
  // gestaffelte Höhenlinien dahinter
  for (const [k, op] of [[0.55, 0.1], [0.78, 0.16]]) {
    svgEl('path', { d: `M0,${H - 30} ` + route.points.map((p, i) => `L${(x(p[0]) * 1.12 - 30 + i * 4).toFixed(1)},${(H - 30 - (H - 30 - y(p[1])) * k).toFixed(1)}`).join(' ') + ` L${W},${H - 30 - 150 * k} L${W},${H - 30} Z`, fill: INK, opacity: op }, svg);
  }
  const pts = route.points.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  svgEl('path', { d: `M${x(0)},${H - 30} L${pts.replace(/ /g, ' L')} L${x(9)},${H - 30} Z`, fill: '#f3f1ec', opacity: 0.55 }, svg);
  svgEl('polyline', { points: pts, fill: 'none', stroke: INK, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, svg);
  svgEl('line', { x1: 0, x2: W, y1: H - 30, y2: H - 30, stroke: INK, 'stroke-width': 0.8 }, svg);
  for (let km = 0; km <= 9; km += 1) {
    svgEl('line', { x1: x(km), x2: x(km), y1: H - 30, y2: H - (km % 3 ? 26 : 22), stroke: INK, 'stroke-width': 0.6 }, svg);
    if (km % 3 === 0) { const t = svgEl('text', { x: x(km), y: H - 10, 'text-anchor': 'middle', fill: MUTED, 'font-size': 8, 'font-family': FONT, 'letter-spacing': 0.8 }, svg); t.textContent = `KM ${km}`; }
  }
  const [mk, me] = [5, 1125];
  svgEl('line', { x1: x(mk), x2: x(mk), y1: y(me), y2: 36, stroke: ACCENT, 'stroke-width': 0.8 }, svg);
  svgEl('circle', { cx: x(mk), cy: y(me), r: 4.5, fill: ACCENT, stroke: '#f3f1ec', 'stroke-width': 2 }, svg);
  const big = svgEl('text', { x: x(mk) + 8, y: 50, fill: INK, 'font-size': 26, 'font-weight': 500, 'letter-spacing': -1, 'font-family': FONT }, svg);
  big.textContent = '+8,5 %';
  const cap = svgEl('text', { x: x(mk) + 9, y: 63, fill: MUTED, 'font-size': 7.5, 'letter-spacing': 0.9, 'font-family': FONT }, svg);
  cap.textContent = 'STEIGUNG · 1.125 M Ü. M.';
  return svg;
}

/** Bild für das Training: Intervallblöcke mit gefahrener Leistungskurve. */
function intervals() {
  const W = 400, H = 250, w = WORKOUTS.find((x) => x.id === 'vo2'), total = workoutDuration(w);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'art', role: 'img', 'aria-label': 'Zeichnung: Intervalltraining als Balken mit Leistungskurve' });
  svgEl('rect', { width: W, height: H, fill: PANEL }, svg);
  const x = (t) => 20 + (t / total) * (W - 40), y = (pct) => H - 34 - (pct / 135) * (H - 80);
  let t = 0, seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const trace = [];
  for (const [dur, from, to] of w.segs) {
    svgEl('polygon', { points: `${x(t)},${H - 34} ${x(t)},${y(from)} ${x(t + dur)},${y(to)} ${x(t + dur)},${H - 34}`, fill: INK, opacity: (0.16 + Math.min(1, (from + to) / 250) * 0.74).toFixed(2), stroke: PANEL, 'stroke-width': 1 }, svg);
    for (let s = 0; s < dur; s += 20) trace.push(`${x(t + s).toFixed(1)},${y(from + ((to - from) * s) / dur + rnd() * 9 + (s < 20 ? -6 : 0)).toFixed(1)}`);
    t += dur;
  }
  svgEl('line', { x1: 20, x2: W - 20, y1: y(100), y2: y(100), stroke: MUTED, 'stroke-width': 0.7, 'stroke-dasharray': '2 3' }, svg);
  svgEl('polyline', { points: trace.join(' '), fill: 'none', stroke: ACCENT, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, svg);
  svgEl('line', { x1: 0, x2: W, y1: H - 34, y2: H - 34, stroke: INK, 'stroke-width': 0.8 }, svg);
  const big = svgEl('text', { x: 22, y: 44, fill: INK, 'font-size': 30, 'font-weight': 500, 'letter-spacing': -1.2, 'font-family': FONT }, svg);
  big.textContent = '5 × 3 min';
  const cap = svgEl('text', { x: 23, y: 58, fill: MUTED, 'font-size': 7.5, 'letter-spacing': 0.9, 'font-family': FONT }, svg);
  cap.textContent = 'VO₂MAX · 118 % FTP';
  return svg;
}

/** Bild für den Marketplace: Markennamen als Schriftbild. */
function names() {
  const W = 400, H = 250;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'art', role: 'img', 'aria-label': 'Schriftbild mit Namen von Rad- und Bekleidungsmarken' });
  svgEl('rect', { width: W, height: H, fill: INK }, svg);
  const rows = ['CANYON · SPECIALIZED', 'CERVÉLO · TREK · ROSE', 'PAS NORMAL STUDIOS', 'RYZON · RAPHA · MAAP', 'WAHOO · GARMIN · ELITE'];
  rows.forEach((r, i) => {
    const t = svgEl('text', { x: 22, y: 52 + i * 42, fill: '#f3f1ec', opacity: i % 2 ? 0.45 : 1, 'font-size': 27, 'font-weight': 500, 'letter-spacing': -0.6, 'font-family': FONT }, svg);
    t.textContent = r;
  });
  return svg;
}

export function renderStart(root) {
  const head = el('header', 'brand');
  head.append(el('span', 'brandname', 'Sitzcheck'), el('span', 'brandtag', 'Indoor Cycling'));

  const hero = el('section', 'hero');
  const text = el('div', 'herotext');
  text.append(el('h1', null, 'Fahren. Messen. Besser sitzen.'),
    el('p', null, 'Alles für den Winter auf der Rolle an einem Ort: Workouts mit deinem Smart Trainer, ein Bike-Fitting per Handykamera und die wichtigsten Adressen für Rad und Bekleidung.'));
  const cta = el('a', 'primary btnlink', 'Training starten');
  cta.href = '#training';
  text.append(cta);
  hero.append(mountain(), text);
  root.replaceChildren(head, hero);

  // Die drei Bereiche
  const fitSvg = svgEl('svg', { viewBox: '-88 -138 196 170', class: 'art', role: 'img', 'aria-label': 'Technische Zeichnung eines Radfahrers mit eingezeichneten Gelenkwinkeln' });
  fitSvg.style.background = PANEL;
  const chapters = [
    { n: '01', href: '#training', title: 'Training', art: intervals(), link: 'Zum Training',
      text: 'Smart Trainer per Bluetooth verbinden und Workouts oder Strecken fahren. Der Trainer stellt Leistung und Steigung von selbst ein.',
      facts: [`${WORKOUTS.length} Workouts`, `${ROUTES.length} Strecken`, 'TCX-Export'] },
    { n: '02', href: '#fitting', title: 'Bike-Fitting', art: fitSvg, link: 'Zur Analyse',
      text: 'Handy seitlich aufstellen, 45 Sekunden treten. Die App misst deine Gelenkwinkel und zeigt im Video, wo du nicht im Zielbereich sitzt.',
      facts: ['7 Messwerte', 'Video mit Winkeln', 'Vorher/Nachher'] },
    { n: '03', href: '#markt', title: 'Marketplace', art: names(), link: 'Zu den Marken',
      text: 'Hersteller, Bekleidungsmarken und Händler auf einen Blick – ein Tipp führt direkt zur Seite des Anbieters.',
      facts: ['Räder', 'Bekleidung', 'Händler'] },
  ];
  for (const c of chapters) {
    const a = el('a', 'chapter');
    a.href = c.href;
    const body = el('div', 'chbody'), facts = el('div', 'chips');
    for (const f of c.facts) facts.append(el('span', 'chip', f));
    body.append(el('span', 'chnum', c.n), el('h2', null, c.title), el('p', null, c.text), facts, el('span', 'chlink', `${c.link} →`));
    a.append(c.art, body);
    root.append(a);
  }
  initHero(fitSvg, () => ({ style: 'sport', bike: findBike('other|aero') }), () => fitSvg.getBoundingClientRect().width > 0 && !document.hidden);

  // Zuletzt
  const fit = read('rollentrainer.history.v1')[0], ride = read('rollentrainer.rides.v1')[0];
  if (fit || ride) {
    const last = el('section', 'lastrow');
    last.append(el('div', 'group', 'Zuletzt'));
    const tiles = el('div', 'stats');
    const tile = (v, label, href) => { const t = el('a', 'stat'); t.href = href; t.append(el('b', null, v), el('small', null, label)); tiles.append(t); };
    if (fit) tile(fit.score != null ? String(fit.score) : '–', 'Fitting-Punkte', '#fitting');
    if (ride) { tile(String(ride.stats.avgPower), 'Ø Watt letzte Fahrt', '#training'); tile(String(Math.round(ride.stats.duration / 60)), 'Minuten gefahren', '#training'); }
    last.append(tiles);
    root.append(last);
  }
  root.append(el('p', 'note', 'Alle Daten bleiben auf deinem Gerät. Die Grafiken sind gezeichnet; die Bike-Fitting-Messung ist eine Orientierung und ersetzt kein professionelles Bikefitting.'),
    el('p', 'note ver', 'Sitzcheck · Version 10'));
}
