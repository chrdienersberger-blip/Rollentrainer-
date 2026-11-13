// Startseite: Überblick über die drei Bereiche, mit gezeichneten Grafiken.

import { initHero, buildBike } from './hero.js?v=12';
import { findBike } from './bikes.js?v=12';
import { WORKOUTS, ROUTES, workoutDuration, routeLength } from './workouts.js?v=12';

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

/**
 * Titelbild als Zeichnung: Serpentinenstraße über dem Meer, davor ein Aero-Rennrad.
 * Liegt im Projekt ein Foto unter img/hero.jpg, ersetzt es diese Zeichnung.
 */
function scene() {
  const W = 400, H = 300;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'art', role: 'img', 'aria-label': 'Zeichnung: Aero-Rennrad vor einer Serpentinenstraße am Meer' });
  svgEl('rect', { width: W, height: H, fill: PANEL }, svg);
  svgEl('circle', { cx: 318, cy: 58, r: 20, fill: '#f3f1ec' }, svg);                                   // Sonne
  svgEl('rect', { x: 0, y: 112, width: W, height: 30, fill: INK, opacity: 0.1 }, svg);                  // Meer
  for (const y of [120, 128, 135]) svgEl('line', { x1: 0, x2: 150, y1: y, y2: y, stroke: '#f3f1ec', 'stroke-width': 0.6, opacity: 0.7 }, svg);
  svgEl('polygon', { points: '0,112 60,84 120,104 170,112', fill: INK, opacity: 0.1 }, svg);           // ferne Küste
  svgEl('polygon', { points: `120,${H} 150,140 205,92 250,58 300,36 340,48 ${W},30 ${W},${H}`, fill: INK, opacity: 0.14 }, svg);
  svgEl('polygon', { points: `0,${H} 0,170 60,150 130,176 200,150 260,190 330,160 ${W},178 ${W},${H}`, fill: INK, opacity: 0.12 }, svg);
  // Serpentinen
  const road = 'M352,52 L262,68 Q244,72 262,80 L340,96 Q358,101 338,108 L236,128 Q214,133 236,142 L322,160 Q346,166 322,174 L210,198';
  svgEl('path', { d: road, fill: 'none', stroke: INK, 'stroke-width': 6.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: 0.85 }, svg);
  svgEl('path', { d: road, fill: 'none', stroke: '#f3f1ec', 'stroke-width': 4.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
  svgEl('path', { d: road, fill: 'none', stroke: MUTED, 'stroke-width': 0.5, 'stroke-dasharray': '3 4' }, svg);
  // Boden und Rad im Vordergrund
  svgEl('rect', { x: 0, y: 262, width: W, height: H - 262, fill: '#f3f1ec' }, svg);
  svgEl('line', { x1: 0, x2: W, y1: 262, y2: 262, stroke: INK, 'stroke-width': 0.9 }, svg);
  const bike = svgEl('g', { transform: 'translate(132,223) scale(1.45,-1.45)', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
  buildBike(bike, findBike('other|aero'));
  svgEl('circle', { cx: 0, cy: 0, r: 9.3, fill: PANEL, stroke: INK, 'stroke-width': 0.5 }, bike);
  svgEl('line', { x1: 0, y1: 0, x2: 12, y2: -12.4, stroke: INK, 'stroke-width': 1.5 }, bike);
  svgEl('line', { x1: 8, y1: -13.6, x2: 16, y2: -14, stroke: INK, 'stroke-width': 1.3 }, bike);
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
  head.append(el('span', 'brandname', 'Sitzcheck'), el('span', 'brandtag', 'Für Rennrad-Einsteiger'));

  const hero = el('section', 'hero');
  const text = el('div', 'herotext');
  text.append(el('div', 'eyebrow dark', 'Dein Einstieg ins Rennradfahren'),
    el('h1', null, 'Vom ersten Rad bis zur ersten Ausfahrt.'),
    el('p', null, 'Sitzcheck begleitet dich Schritt für Schritt: das passende Rad finden, richtig ausstatten, richtig sitzen und mit einem Einsteigerplan losfahren.'));
  const cta = el('a', 'primary btnlink', 'Los geht’s');
  cta.href = '#markt';
  text.append(cta);
  const art = el('div', 'heroart');
  art.append(scene());
  hero.append(art, text);
  root.replaceChildren(head, hero);
  // eigenes Foto, falls vorhanden
  const photo = new Image();
  photo.onload = () => { photo.className = 'herophoto'; photo.alt = 'Rennrad vor Berglandschaft'; art.replaceChildren(photo); };
  photo.src = 'img/hero.jpg';

  // Dein Weg in vier Schritten
  const starter = (() => { try { return JSON.parse(localStorage.getItem('rollentrainer.starter.v1')) ?? {}; } catch { return {}; } })();
  const training = (() => { try { return JSON.parse(localStorage.getItem('rollentrainer.training.v1')) ?? {}; } catch { return {}; } })();
  const must = ['helm', 'hose', 'flasche', 'panne', 'licht'];
  const way = [
    ['Das passende Rad finden', 'Drei Fragen, eine klare Empfehlung – mit Modellen zum Anschauen.', '#markt', !!starter.use],
    ['Richtig ausstatten', 'Die Liste mit allem, was du wirklich brauchst. Und was warten kann.', '#markt', must.every((k) => starter.checked?.[k])],
    ['Richtig sitzen', 'Handy aufstellen, kurz treten: Die App prüft Sattelhöhe und Sitzposition.', '#fitting', read('rollentrainer.history.v1').length > 0],
    ['Losfahren', 'Vier Wochen Einsteigerplan mit Tipps zu Essen und Trinken vor jeder Einheit.', '#training', read('rollentrainer.rides.v1').length > 0 || Object.keys(training.planDone ?? {}).length > 0],
  ];
  const path = el('section', 'way');
  path.append(el('div', 'group', 'Dein Weg in vier Schritten'));
  const next = way.findIndex((w) => !w[3]);
  way.forEach(([title, sub, href, done], i) => {
    const a = el('a', `wayrow${done ? ' done' : ''}${i === next ? ' next' : ''}`);
    a.href = href;
    const body = el('div');
    body.append(el('b', null, title), el('small', null, sub));
    a.append(el('i', 'tick', done ? '✓' : String(i + 1)), body, el('span', 'go', i === next ? 'Weiter →' : '→'));
    path.append(a);
  });
  root.append(path);

  // Die drei Bereiche
  const fitSvg = svgEl('svg', { viewBox: '-88 -138 196 170', class: 'art', role: 'img', 'aria-label': 'Technische Zeichnung eines Radfahrers mit eingezeichneten Gelenkwinkeln' });
  fitSvg.style.background = PANEL;
  const chapters = [
    { n: '01', href: '#training', title: 'Training', art: intervals(), link: 'Zum Training',
      text: 'Ein Vier-Wochen-Plan für Einsteiger, dazu Workouts und Strecken für deinen Smart Trainer – mit Hinweisen, was du vorher essen und trinken solltest.',
      facts: ['Einsteigerplan', `${WORKOUTS.length} Workouts`, `${ROUTES.length} Strecken`] },
    { n: '02', href: '#fitting', title: 'Bike-Fitting', art: fitSvg, link: 'Zur Analyse',
      text: 'Handy seitlich aufstellen, 45 Sekunden treten. Die App misst deine Gelenkwinkel und zeigt im Video, wo du nicht im Zielbereich sitzt.',
      facts: ['7 Messwerte', 'Video mit Winkeln', 'Vorher/Nachher'] },
    { n: '03', href: '#markt', title: 'Marketplace', art: names(), link: 'Zu den Marken',
      text: 'Welches Rad zu dir passt, was zur Erstausstattung gehört und wo du Räder und Bekleidung findest.',
      facts: ['Rad-Berater', 'Erstausstattung', 'Marken'] },
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
    el('p', 'note ver', 'Sitzcheck · Version 12'));
}
