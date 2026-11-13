// Animierte Startgrafik: Fahrer und Rad als technische Zeichnung in der Seitenansicht.
// Maße in cm, Ursprung = Tretlager, x nach vorn, y nach oben (Gruppe ist gespiegelt).
// Die Räder sind Typ-Silhouetten (Aero, Allround, Endurance, Gravel, Zeitfahren),
// keine maßstabsgetreuen Abbildungen einzelner Modelle.

import { riderPose } from './demo.js?v=11';
import { angleAt } from './analysis.js?v=11';

const SVGNS = 'http://www.w3.org/2000/svg';
const HIP = { x: -74 * Math.cos((73 * Math.PI) / 180), y: 74 * Math.sin((73 * Math.PI) / 180) };
const TORSO = { komfort: 52, sport: 44, rennen: 36, tt: 22 };
const REAR = { x: -41, y: 7 };

// Rahmen- und Laufradform je Radtyp
const SPECS = {
  aero: { H1: [40.5, 53], H2: [44.5, 42], front: 59, stem: [9, 4], tyre: 2.6, rim: 7, tube: { down: 4.6, seat: 4, top: 2.8, stay: 1.8, fork: 3.2 }, dropped: 36, bar: 'drop' },
  allround: { H1: [40, 55], H2: [44, 44], front: 59, stem: [9, 4], tyre: 2.6, rim: 3.8, tube: { down: 3.4, seat: 2.8, top: 2.5, stay: 1.5, fork: 2.4 }, dropped: 43, bar: 'drop' },
  endurance: { H1: [38, 58], H2: [43, 45], front: 60.5, stem: [8, 7], tyre: 3.2, rim: 2.8, tube: { down: 3.4, seat: 2.8, top: 2.5, stay: 1.5, fork: 2.4 }, dropped: 48, bar: 'drop' },
  gravel: { H1: [38, 58], H2: [43.5, 45], front: 62.5, stem: [8, 7], tyre: 4.8, rim: 2.6, knobs: true, tube: { down: 3.6, seat: 2.9, top: 2.6, stay: 1.7, fork: 2.8 }, dropped: 44, bar: 'drop' },
  tt: { H1: [42, 49], H2: [45.5, 40], front: 58.5, stem: [8, 3], tyre: 2.4, rim: 9, disc: true, tube: { down: 5.2, seat: 4.8, top: 3, stay: 2, fork: 3.6 }, dropped: 30, bar: 'tt' },
};

const INK = '#111110', PANEL = '#e4dfd5', GRID = '#d3cdc1', MID = '#77736b', ACCENT = '#a8553a';
const BODY = '#a7a196', BODY_FAR = '#c4beb2';
const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';

const svgEl = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
};
const f1 = (v) => v.toFixed(1);
const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Körperteil als sich verjüngende Kapsel zwischen a und b (Breiten w1, w2). */
function limb(a, b, w1, w2) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L, r1 = w1 / 2, r2 = w2 / 2;
  return `M${f1(a.x + nx * r1)},${f1(a.y + ny * r1)} L${f1(b.x + nx * r2)},${f1(b.y + ny * r2)} ` +
    `A${f1(r2)},${f1(r2)} 0 0 0 ${f1(b.x - nx * r2)},${f1(b.y - ny * r2)} ` +
    `L${f1(a.x - nx * r1)},${f1(a.y - ny * r1)} A${f1(r1)},${f1(r1)} 0 0 0 ${f1(a.x + nx * r1)},${f1(a.y + ny * r1)} Z`;
}

function wheel(parent, cx, cy, spec, isRear) {
  const g = svgEl('g', { fill: 'none', stroke: INK }, parent);
  const R = 34, inner = R - spec.tyre, rim = inner - spec.rim;
  const spokes = svgEl('g', {}, g);
  if (spec.disc && isRear) {
    svgEl('circle', { cx, cy, r: inner, fill: '#d6d0c4', 'stroke-width': 0.4 }, g);
    svgEl('line', { x1: cx - 10, y1: cy, x2: cx + 10, y2: cy, 'stroke-width': 0.3 }, spokes);
  } else {
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 10;
      svgEl('line', { x1: cx - rim * Math.cos(a), y1: cy - rim * Math.sin(a), x2: cx + rim * Math.cos(a), y2: cy + rim * Math.sin(a), stroke: MID, 'stroke-width': 0.18 }, spokes);
    }
    svgEl('circle', { cx, cy, r: rim, 'stroke-width': 0.4 }, g);
    svgEl('circle', { cx, cy, r: inner, 'stroke-width': 0.4 }, g);
  }
  svgEl('circle', { cx, cy, r: R, 'stroke-width': spec.knobs ? 1.1 : 0.7, ...(spec.knobs ? { 'stroke-dasharray': '1.4 1' } : {}) }, g);
  svgEl('circle', { cx, cy, r: 1.6, fill: PANEL, 'stroke-width': 0.5 }, g);
  return { spokes, cx, cy };
}

/** Zeichnet das Rad neu (bei Wechsel des Modells). Liefert Griffpunkt und drehende Teile. */
export function buildBike(layer, bike) {
  layer.replaceChildren();
  const spec = SPECS[bike.cat] ?? SPECS.allround;
  const t = spec.tube;
  const seat = (len) => [-len * Math.cos((73 * Math.PI) / 180), len * Math.sin((73 * Math.PI) / 180)];
  const BB = [0, 0], S = seat(50), R = [REAR.x, REAR.y], F = [spec.front, 7];
  const wheels = [wheel(layer, R[0], R[1], spec, true), wheel(layer, F[0], F[1], spec, false)];

  // Rohre als Umrisszeichnung: erst alle Konturen, dann alle Füllungen – so verschmelzen die Knoten sauber
  const outline = svgEl('g', { fill: 'none', stroke: INK }, layer);
  const fill = svgEl('g', { fill: 'none', stroke: PANEL }, layer);
  const tube = (pts, w) => {
    const points = pts.map((p) => p.join(',')).join(' ');
    svgEl('polyline', { points, 'stroke-width': w }, outline);
    svgEl('polyline', { points, 'stroke-width': Math.max(0.2, w - 0.9) }, fill);
  };
  const pathTube = (d, w) => {
    svgEl('path', { d, 'stroke-width': w }, outline);
    svgEl('path', { d, 'stroke-width': Math.max(0.2, w - 0.9) }, fill);
  };
  tube([R, BB], t.stay + 0.5);
  tube([seat(spec.dropped), R], t.stay + 0.2);
  tube([seat(63.5), seat(48)], spec.bar === 'tt' ? 3 : 2.1);                 // Sattelstütze
  tube([BB, S], t.seat);
  tube([S, spec.H1], t.top);
  tube([BB, spec.H2], t.down);
  tube([spec.H2, F], t.fork);
  tube([spec.H1, spec.H2], t.down * 0.9);
  // Cockpit
  const Cx = spec.H1[0] + spec.stem[0], Cy = spec.H1[1] + spec.stem[1];
  tube([[spec.H1[0] - 0.6, spec.H1[1] + 2], [Cx, Cy]], 2.3);
  let grip;
  if (spec.bar === 'tt') {
    grip = { x: Cx + 27, y: Cy + 10 };
    tube([[Cx, Cy], [Cx + 9, Cy - 2.5]], 2.1);
    pathTube(`M${Cx - 2},${Cy + 3.5} Q${Cx + 16},${Cy + 2.5} ${grip.x},${grip.y}`, 1.7);
    tube([[Cx - 3, Cy + 5.4], [Cx + 6, Cy + 5.8]], 2.3);
  } else {
    grip = { x: Cx + 9, y: Cy + 3 };
    pathTube(`M${Cx},${Cy} L${grip.x},${grip.y} Q${grip.x + 3.5},${grip.y + 5} ${grip.x + 2},${grip.y + 0.5}`, 2.2);
    pathTube(`M${Cx + 5},${Cy + 1.2} Q${Cx + 15},${Cy - 1} ${Cx + 12},${Cy - 8} Q${Cx + 9},${Cy - 14} ${Cx + 1},${Cy - 12.5}`, 2.2);
    svgEl('line', { x1: grip.x + 2.4, y1: grip.y + 1, x2: grip.x + 4.2, y2: grip.y - 8, stroke: INK, 'stroke-width': 0.5 }, layer);
  }
  // Sattel, Kette
  svgEl('path', { d: 'M-32,65.2 Q-31,62.6 -24,63 L-10,63.4 Q-6.5,63.6 -6.5,64.6 Q-14,65.6 -22,65.4 Q-28,66.6 -32,65.2 Z', fill: PANEL, stroke: INK, 'stroke-width': 0.5 }, layer);
  for (const dy of [9, -9]) {
    svgEl('line', { x1: 0, y1: dy, x2: R[0], y2: R[1] + dy * 0.36, stroke: INK, 'stroke-width': 0.3 }, layer);
  }
  svgEl('circle', { cx: R[0], cy: R[1], r: 3.3, fill: PANEL, stroke: INK, 'stroke-width': 0.4 }, layer);
  const wrist = spec.bar === 'tt' ? { x: grip.x - 5, y: grip.y + 2 } : { x: grip.x - 7, y: grip.y + 3 };
  return { wheels, grip, wrist };
}

/**
 * svg: Ziel-Element,
 * getState(): { style, bike } – wird in jedem Bild abgefragt.
 */
export function initHero(svg, getState, isVisible) {
  const root = svgEl('g', { transform: 'scale(1,-1)', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
  // Raster und Bodenlinie mit Maßteilung
  const grid = svgEl('g', { stroke: GRID, 'stroke-width': 0.2 }, root);
  for (let x = -80; x <= 100; x += 20) svgEl('line', { x1: x, x2: x, y1: -32, y2: 138 }, grid);
  for (let y = -7; y <= 133; y += 20) svgEl('line', { x1: -88, x2: 108, y1: y, y2: y }, grid);
  svgEl('line', { x1: -88, x2: 108, y1: -27, y2: -27, stroke: INK, 'stroke-width': 0.4 }, root);
  for (let x = -80; x <= 100; x += 10) {
    svgEl('line', { x1: x, x2: x, y1: -27, y2: x % 20 ? -28 : -29, stroke: INK, 'stroke-width': 0.25 }, root);
  }
  // Maßlinie Sattelhöhe (Tretlager bis Satteloberkante, parallel zum Sitzrohr)
  const ca = Math.cos((73 * Math.PI) / 180), sa = Math.sin((73 * Math.PI) / 180), off = 13;
  const d0 = { x: -off * sa, y: -off * ca }, d1 = { x: -66 * ca - off * sa, y: 66 * sa - off * ca };
  const dim = svgEl('g', { stroke: MID, 'stroke-width': 0.3, fill: 'none' }, root);
  svgEl('line', { x1: d0.x, y1: d0.y, x2: d1.x, y2: d1.y }, dim);
  for (const p of [d0, d1]) svgEl('line', { x1: p.x - 2.2 * sa, y1: p.y - 2.2 * ca, x2: p.x + 2.2 * sa, y2: p.y + 2.2 * ca }, dim);
  svgEl('line', { x1: 0, y1: 0, x2: d0.x, y2: d0.y, 'stroke-dasharray': '0.8 1.2' }, dim);
  svgEl('line', { x1: -66 * ca, y1: 66 * sa, x2: d1.x, y2: d1.y, 'stroke-dasharray': '0.8 1.2' }, dim);

  const part = (parent, fill) => svgEl('path', { fill }, parent);
  // Reihenfolge = Tiefe: hinteres Bein, Rad, Körper, Messlinien
  const farLeg = { thigh: part(root, BODY_FAR), shank: part(root, BODY_FAR), foot: part(root, BODY_FAR) };
  const farCrank = svgEl('line', { stroke: INK, 'stroke-width': 0.9 }, root);
  const bikeLayer = svgEl('g', {}, root);
  svgEl('circle', { cx: 0, cy: 0, r: 9.3, fill: PANEL, stroke: INK, 'stroke-width': 0.5 }, root);
  svgEl('circle', { cx: 0, cy: 0, r: 7.6, fill: 'none', stroke: INK, 'stroke-width': 0.25 }, root);
  const crank = svgEl('line', { stroke: INK, 'stroke-width': 1.5 }, root);
  const pedal = svgEl('line', { stroke: INK, 'stroke-width': 1.3 }, root);
  const bodyG = svgEl('g', { opacity: 0.92 }, root);
  const nearLeg = { thigh: part(bodyG, BODY), shank: part(bodyG, BODY), foot: part(bodyG, BODY) };
  const torso = part(bodyG, BODY), neck = part(bodyG, BODY);
  const head = svgEl('circle', { r: 6.8, fill: BODY }, bodyG);
  const upperArm = part(bodyG, BODY), forearm = part(bodyG, BODY), hand = part(bodyG, BODY);
  // Messlinien
  const bones = svgEl('polyline', { fill: 'none', stroke: INK, 'stroke-width': 0.55 }, root);
  const arcs = ['knee', 'hip', 'elbow'].map((k) => [k, svgEl('path', { stroke: ACCENT, 'stroke-width': 0.6, fill: 'none' }, root)]);
  const joints = ['wrist', 'elbow', 'shoulder', 'hip', 'knee', 'ankle'].map((k) =>
    [k, svgEl('circle', { r: 1.5, fill: '#f3f1ec', stroke: INK, 'stroke-width': 0.6 }, root)]);

  // Beschriftung (ungespiegelt)
  const halo = { stroke: PANEL, 'stroke-width': 2.2, 'paint-order': 'stroke', 'stroke-linejoin': 'round', 'font-family': FONT };
  const mkLabel = (title) => {
    const g = svgEl('g', {}, svg);
    const val = svgEl('text', { ...halo, fill: INK, 'font-size': 7, 'font-weight': 500, 'letter-spacing': -0.2 }, g);
    const cap = svgEl('text', { ...halo, 'stroke-width': 1.6, fill: MID, 'font-size': 2.9, 'letter-spacing': 0.5, y: 4.2 }, g);
    cap.textContent = title;
    return { g, val };
  };
  const labels = { knee: mkLabel('KNIE'), hip: mkLabel('HÜFTE'), elbow: mkLabel('ELLBOGEN') };
  const dimText = svgEl('text', { ...halo, 'stroke-width': 1.6, fill: MID, 'font-size': 2.9, 'letter-spacing': 0.5, 'text-anchor': 'middle',
    transform: `translate(${f1((d0.x + d1.x) / 2 - 2.6)},${f1(-(d0.y + d1.y) / 2)}) rotate(-73)` }, svg);
  dimText.textContent = 'SATTELHÖHE';

  let bikeKey = null, bikeParts = null;
  const cur = { torso: TORSO[getState().style] ?? 44, wrist: null };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const setLine = (n, a, b) => { n.setAttribute('x1', f1(a.x)); n.setAttribute('y1', f1(a.y)); n.setAttribute('x2', f1(b.x)); n.setAttribute('y2', f1(b.y)); };

  function leg(p, els) {
    els.thigh.setAttribute('d', limb(p.hip, p.knee, 12.5, 9));
    els.shank.setAttribute('d', limb(p.knee, p.ankle, 8.6, 5));
    const back = { x: p.heel.x + 1, y: p.heel.y + 1.5 }, tip = { x: p.toe.x + 1.5, y: p.toe.y + 1.2 };
    els.foot.setAttribute('d', `${limb(back, tip, 6, 3.4)} ${limb(p.ankle, lerpP(back, tip, 0.35), 5.2, 5.2)}`);
  }

  /** Winkelbogen und Wert am Gelenk b zwischen den Schenkeln nach a und c. */
  function mark(name, a, b, c, r, dx, dy) {
    const a1 = Math.atan2(a.y - b.y, a.x - b.x), a2 = Math.atan2(c.y - b.y, c.x - b.x);
    let sweep = a2 - a1;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    const pt = (t) => `${f1(b.x + r * Math.cos(t))},${f1(b.y + r * Math.sin(t))}`;
    arcs.find(([k]) => k === name)[1].setAttribute('d', `M${pt(a1)} A${r},${r} 0 0 ${sweep > 0 ? 1 : 0} ${pt(a2)}`);
    labels[name].val.textContent = `${Math.round(angleAt(a, b, c))}°`;
    labels[name].g.setAttribute('transform', `translate(${f1(b.x + dx)},${f1(-b.y + dy)})`);
  }

  function draw(th) {
    const { style, bike } = getState();
    const key = `${bike.name}|${bike.cat}`;
    if (key !== bikeKey) {
      bikeKey = key;
      bikeParts = buildBike(bikeLayer, bike);
      cur.wrist ??= { ...bikeParts.wrist };
    }
    const k = reduced ? 1 : 0.09;
    cur.wrist = lerpP(cur.wrist, bikeParts.wrist, k);
    cur.torso += ((TORSO[style] ?? 44) - cur.torso) * k;
    // Oberkörper nur so aufrecht, wie die Arme den Lenker noch erreichen
    let torsoDeg = cur.torso;
    for (; torsoDeg > 10; torsoDeg -= 0.5) {
      const r = (torsoDeg * Math.PI) / 180;
      if (Math.hypot(HIP.x + 50 * Math.cos(r) - cur.wrist.x, HIP.y + 50 * Math.sin(r) - cur.wrist.y) <= 55.5) break;
    }
    const opts = { torsoDeg, wristOffset: { x: cur.wrist.x - HIP.x, y: cur.wrist.y - HIP.y } };
    const p = riderPose(th, opts), q = riderPose(th + Math.PI, opts);

    const deg = (-th * 2.7 * 180) / Math.PI;
    for (const w of bikeParts.wheels) w.spokes.setAttribute('transform', `rotate(${f1(deg % 360)} ${w.cx} ${w.cy})`);
    setLine(farCrank, { x: 0, y: 0 }, q.spindle);
    setLine(crank, { x: 0, y: 0 }, p.spindle);
    setLine(pedal, { x: p.spindle.x - 4, y: p.spindle.y - 1.4 }, { x: p.spindle.x + 4, y: p.spindle.y - 1.8 });
    leg(q, farLeg);
    leg(p, nearLeg);

    // Rumpf mit leicht gerundetem Rücken
    const tr = (torsoDeg * Math.PI) / 180, ux = Math.cos(tr), uy = Math.sin(tr), nx = -uy, ny = ux;
    const at = (base, along, off) => `${f1(base.x + ux * along + nx * off)},${f1(base.y + uy * along + ny * off)}`;
    const midB = { x: (p.hip.x + p.shoulder.x) / 2, y: (p.hip.y + p.shoulder.y) / 2 };
    torso.setAttribute('d',
      `M${at(p.hip, -5, 7.5)} Q${at(midB, 0, 12.5)} ${at(p.shoulder, 2, 6)} ` +
      `Q${at(p.shoulder, 6.5, 0)} ${at(p.shoulder, 1, -6.6)} Q${at(midB, 2, -9.5)} ${at(p.hip, 2, -8)} ` +
      `Q${at(p.hip, -9.5, -4)} ${at(p.hip, -5, 7.5)} Z`);
    const na = (Math.max(torsoDeg + 22, 50) * Math.PI) / 180;
    const base = { x: p.shoulder.x + ux * 2, y: p.shoulder.y + uy * 2 };
    const hc = { x: base.x + 12.5 * Math.cos(na), y: base.y + 12.5 * Math.sin(na) };
    neck.setAttribute('d', limb(base, hc, 6.2, 5.2));
    head.setAttribute('cx', f1(hc.x)); head.setAttribute('cy', f1(hc.y));
    upperArm.setAttribute('d', limb(p.shoulder, p.elbow, 7.2, 5.6));
    forearm.setAttribute('d', limb(p.elbow, p.wrist, 5.6, 4.2));
    hand.setAttribute('d', limb(p.wrist, { x: p.wrist.x + (bikeParts.grip.x - bikeParts.wrist.x), y: p.wrist.y + (bikeParts.grip.y - bikeParts.wrist.y) }, 4.4, 3.8));

    // Messlinien und Winkel
    bones.setAttribute('points', [p.wrist, p.elbow, p.shoulder, p.hip, p.knee, p.ankle].map((v) => `${f1(v.x)},${f1(v.y)}`).join(' '));
    for (const [name, c] of joints) { c.setAttribute('cx', f1(p[name].x)); c.setAttribute('cy', f1(p[name].y)); }
    mark('knee', p.hip, p.knee, p.ankle, 9, 11, 1);
    mark('hip', p.shoulder, p.hip, p.knee, 11, -27, -4);
    mark('elbow', p.shoulder, p.elbow, p.wrist, 7, 4, 12);
  }

  if (reduced) { draw(2.2); setInterval(() => isVisible() && draw(2.2), 300); return; }
  const tick = (t) => {
    if (!svg.isConnected) return; // Grafik wurde entfernt – Animation beenden
    if (isVisible()) draw((t / 1000) * 2 * Math.PI * (55 / 60));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
