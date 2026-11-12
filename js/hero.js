// Animierte Startgrafik: Fahrer und Rad als stilisierte Seitenansicht.
// Maße in cm, Ursprung = Tretlager, x nach vorn, y nach oben (Gruppe ist gespiegelt).
// Die Räder sind Typ-Silhouetten (Aero, Allround, Endurance, Gravel, Zeitfahren),
// keine maßstabsgetreuen Abbildungen einzelner Modelle.

import { riderPose } from './demo.js';
import { angleAt } from './analysis.js';
import { CATEGORIES } from './bikes.js';

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

const C = {
  frame: '#171716', frameShade: '#34332f', tyre: '#1c1c1b', rim: '#3a3935', spoke: '#a39e94',
  metal: '#77736b', dark: '#111110', skin: '#d9a888', shorts: '#4b4d40', jersey: '#a8553a',
  sock: '#fbfaf7', shoe: '#fbfaf7', helmet: '#111110', glass: '#111110', paper: '#f3f1ec', ink: '#111110',
};

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
  const g = svgEl('g', {}, parent);
  const R = 34, rimR = R - spec.tyre / 2 - spec.rim / 2 - 0.3;
  const spokes = svgEl('g', {}, g);
  if (spec.disc && isRear) {
    svgEl('circle', { cx, cy, r: R - spec.tyre, fill: '#262624', stroke: C.rim, 'stroke-width': 0.6 }, g);
    svgEl('line', { x1: cx - 8, y1: cy, x2: cx + 8, y2: cy, stroke: C.rim, 'stroke-width': 0.8 }, spokes);
  } else {
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI) / 9, r = rimR;
      svgEl('line', { x1: cx - r * Math.cos(a), y1: cy - r * Math.sin(a), x2: cx + r * Math.cos(a), y2: cy + r * Math.sin(a), stroke: C.spoke, 'stroke-width': 0.35 }, spokes);
    }
    svgEl('circle', { cx, cy, r: rimR, fill: 'none', stroke: C.rim, 'stroke-width': spec.rim }, g);
  }
  const tyre = svgEl('circle', { cx, cy, r: R - spec.tyre / 2, fill: 'none', stroke: C.tyre, 'stroke-width': spec.tyre }, g);
  if (spec.knobs) {
    svgEl('circle', { cx, cy, r: R + 0.3, fill: 'none', stroke: C.tyre, 'stroke-width': 1.4, 'stroke-dasharray': '1.6 1.6' }, spokes);
  }
  svgEl('circle', { cx, cy, r: 1.9, fill: C.metal }, g);
  g.append(spokes, tyre);
  return { spokes, cx, cy };
}

/** Zeichnet das Rad neu (bei Wechsel des Modells). Liefert Griffpunkt und drehende Teile. */
function buildBike(layer, textLayer, bike) {
  layer.replaceChildren();
  textLayer.replaceChildren();
  const spec = SPECS[bike.cat] ?? SPECS.allround;
  const t = spec.tube;
  const line = (pts, stroke, w, extra = {}) =>
    svgEl('polyline', { points: pts.map((p) => p.join(',')).join(' '), stroke, 'stroke-width': w, fill: 'none', ...extra }, layer);
  const seat = (len) => [-len * Math.cos((73 * Math.PI) / 180), len * Math.sin((73 * Math.PI) / 180)];
  const BB = [0, 0], S = seat(50), R = [REAR.x, REAR.y], F = [spec.front, 7];

  const wheels = [wheel(layer, R[0], R[1], spec, true), wheel(layer, F[0], F[1], spec, false)];
  // Kette
  line([[0, 9], [R[0], R[1] + 3.2]], C.dark, 0.7);
  line([[0, -9], [R[0], R[1] - 3.2]], C.dark, 0.7);
  svgEl('circle', { cx: R[0], cy: R[1], r: 3.4, fill: C.dark }, layer);
  // Rahmen
  line([R, BB], C.frameShade, t.stay + 0.6);
  line([seat(spec.dropped), R], C.frameShade, t.stay);
  line([seat(63.5), seat(48)], C.dark, spec.bar === 'tt' ? 3.4 : 2.2);       // Sattelstütze
  line([BB, S], C.frame, t.seat);
  line([S, spec.H1], C.frame, t.top);
  line([BB, spec.H2], C.frame, t.down);
  line([spec.H2, F], C.frameShade, t.fork);
  line([spec.H1, spec.H2], C.frame, t.down * 0.9);
  // Sattel
  svgEl('path', { d: 'M-32,65.2 Q-31,62.6 -24,63 L-10,63.4 Q-6.5,63.6 -6.5,64.6 Q-14,65.6 -22,65.4 Q-28,66.6 -32,65.2 Z', fill: C.dark, stroke: C.dark, 'stroke-width': 0.5 }, layer);
  // Cockpit
  const Cx = spec.H1[0] + spec.stem[0], Cy = spec.H1[1] + spec.stem[1];
  line([[spec.H1[0] - 0.6, spec.H1[1] + 2], [Cx, Cy]], C.dark, 2.8);
  let grip;
  if (spec.bar === 'tt') {
    grip = { x: Cx + 27, y: Cy + 10 };
    line([[Cx, Cy], [Cx + 9, Cy - 2.5]], C.dark, 2.4);
    svgEl('path', { d: `M${Cx - 2},${Cy + 3.5} Q${Cx + 16},${Cy + 2.5} ${grip.x},${grip.y}`, stroke: C.metal, 'stroke-width': 1.7, fill: 'none' }, layer);
    line([[Cx - 3, Cy + 5.2], [Cx + 6, Cy + 5.6]], C.dark, 2.6);
  } else {
    grip = { x: Cx + 9, y: Cy + 3 };
    svgEl('path', {
      d: `M${Cx},${Cy} L${grip.x},${grip.y} Q${grip.x + 3.5},${grip.y + 5} ${grip.x + 2},${grip.y + 0.5}` +
        ` M${Cx + 5},${Cy + 1.2} Q${Cx + 15},${Cy - 1} ${Cx + 12},${Cy - 8} Q${Cx + 9},${Cy - 14} ${Cx + 1},${Cy - 12.5}`,
      stroke: C.dark, 'stroke-width': 2.6, fill: 'none',
    }, layer);
    line([[grip.x + 2.4, grip.y + 1], [grip.x + 4.2, grip.y - 8]], C.metal, 0.9);
  }
  // Modellname auf dem Unterrohr
  if (!bike.generic) {
    const ang = (Math.atan2(spec.H2[1], spec.H2[0]) * 180) / Math.PI;
    const txt = svgEl('text', {
      transform: `translate(${spec.H2[0] * 0.5},${-spec.H2[1] * 0.5}) rotate(${-ang})`,
      'text-anchor': 'middle', 'dominant-baseline': 'central', fill: C.paper,
      'font-size': Math.min(3.2, t.down * 0.74), 'font-weight': 800, 'letter-spacing': 0.5,
      'font-family': 'system-ui, sans-serif',
    }, textLayer);
    txt.textContent = bike.name.split(' ').slice(1).join(' ').toUpperCase();
  }
  const wrist = spec.bar === 'tt' ? { x: grip.x - 5, y: grip.y + 2 } : { x: grip.x - 7, y: grip.y + 3 };
  return { wheels, grip, wrist };
}

/**
 * svg: Ziel-Element, caption: Element für den Modellnamen,
 * getState(): { style, bike } – wird in jedem Bild abgefragt.
 */
export function initHero(svg, caption, getState, isVisible) {
  const root = svgEl('g', { transform: 'scale(1,-1)', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
  svgEl('ellipse', { cx: 9, cy: -27.5, rx: 78, ry: 2.2, fill: C.ink, opacity: 0.1 }, root);
  svgEl('line', { x1: -88, x2: 108, y1: -27, y2: -27, stroke: '#bdb8ad', 'stroke-width': 0.4 }, root);

  const part = (parent, fill, extra = {}) => svgEl('path', { fill, ...extra }, parent);
  // Reihenfolge = Tiefe: hinteres Bein, Rad, vorderes Bein, Rumpf, Arm, Kopf
  const far = svgEl('g', { opacity: 0.55 }, root);
  const farCrank = svgEl('line', { stroke: C.metal, 'stroke-width': 2 }, far);
  const fThigh = part(far, C.skin), fShorts = part(far, C.shorts), fShank = part(far, C.skin);
  const fSock = part(far, C.sock), fShoe = part(far, C.shoe);
  const bikeLayer = svgEl('g', {}, root);
  const ring = svgEl('circle', { cx: 0, cy: 0, r: 9.3, fill: '#262624', stroke: C.metal, 'stroke-width': 1.3 }, root);
  const crank = svgEl('line', { stroke: C.metal, 'stroke-width': 2.2 }, root);
  const pedal = svgEl('line', { stroke: C.dark, 'stroke-width': 1.8 }, root);
  const shank = part(root, C.skin), sock = part(root, C.sock), shoe = part(root, C.shoe);
  const sole = svgEl('line', { stroke: C.dark, 'stroke-width': 1.1 }, root);
  const thigh = part(root, C.skin), shorts = part(root, C.shorts);
  const torso = part(root, C.jersey);
  const hipCap = svgEl('circle', { r: 7.8, fill: C.shorts }, root);
  const neck = part(root, C.skin);
  const head = svgEl('circle', { r: 6.6, fill: C.skin }, root);
  const helmet = part(root, C.helmet, { stroke: C.dark, 'stroke-width': 0.4 });
  const glasses = svgEl('line', { stroke: C.glass, 'stroke-width': 2.1 }, root);
  const upperArm = part(root, C.skin), sleeve = part(root, C.jersey);
  const forearm = part(root, C.skin), hand = part(root, C.glass);
  // Mess-Overlay
  const arc = svgEl('path', { stroke: C.ink, 'stroke-width': 0.5, 'stroke-dasharray': '1 1.6', fill: 'none' }, root);
  const joints = ['shoulder', 'elbow', 'hip', 'knee', 'ankle'].map((k) =>
    [k, svgEl('circle', { r: 1.7, fill: C.paper, stroke: C.ink, 'stroke-width': 0.8 }, root)]);
  const textLayer = svgEl('g', {}, svg);
  const label = svgEl('text', { fill: C.ink, stroke: '#e4dfd5', 'stroke-width': 2.4, 'paint-order': 'stroke', 'stroke-linejoin': 'round', 'font-size': 9, 'font-weight': 500, 'letter-spacing': -0.3, 'font-family': 'Helvetica Neue, Helvetica, Arial, sans-serif' }, svg);
  const sub = svgEl('text', { fill: '#55524c', stroke: '#e4dfd5', 'stroke-width': 1.6, 'paint-order': 'stroke', 'stroke-linejoin': 'round', 'font-size': 3.2, 'letter-spacing': 0.5, 'font-family': 'Helvetica Neue, Helvetica, Arial, sans-serif' }, svg);
  sub.textContent = 'KNIEWINKEL';

  let bikeKey = null, bikeParts = null;
  const cur = { torso: TORSO[getState().style] ?? 44, wrist: null };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function leg(p, els) {
    els.thigh.setAttribute('d', limb(p.hip, p.knee, 12.5, 9.2));
    els.shorts.setAttribute('d', limb(p.hip, lerpP(p.hip, p.knee, 0.62), 13.2, 11.2));
    els.shank.setAttribute('d', limb(p.knee, p.ankle, 8.8, 5.2));
    els.sock.setAttribute('d', limb(lerpP(p.knee, p.ankle, 0.8), p.ankle, 5.8, 5.4));
    const back = { x: p.heel.x + 1, y: p.heel.y + 1.5 }, tip = { x: p.toe.x + 1.5, y: p.toe.y + 1.2 };
    els.shoe.setAttribute('d', `${limb(back, tip, 6.4, 3.6)} ${limb(p.ankle, lerpP(back, tip, 0.35), 5.6, 5.6)}`);
  }

  function draw(th) {
    const { style, bike } = getState();
    const key = `${bike.name}|${bike.cat}`;
    if (key !== bikeKey) {
      bikeKey = key;
      bikeParts = buildBike(bikeLayer, textLayer, bike);
      caption.replaceChildren();
      const b = document.createElement('b');
      b.textContent = bike.generic ? CATEGORIES[bike.cat].label : bike.name;
      caption.append(b);
      if (!bike.generic) caption.append(` · ${CATEGORIES[bike.cat].label}`);
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

    // Antrieb
    const deg = (-th * 2.7 * 180) / Math.PI;
    for (const w of bikeParts.wheels) w.spokes.setAttribute('transform', `rotate(${f1(deg % 360)} ${w.cx} ${w.cy})`);
    const setLine = (n, a, b) => { n.setAttribute('x1', f1(a.x)); n.setAttribute('y1', f1(a.y)); n.setAttribute('x2', f1(b.x)); n.setAttribute('y2', f1(b.y)); };
    setLine(farCrank, { x: 0, y: 0 }, q.spindle);
    setLine(crank, { x: 0, y: 0 }, p.spindle);
    setLine(pedal, { x: p.spindle.x - 4, y: p.spindle.y - 1.4 }, { x: p.spindle.x + 4, y: p.spindle.y - 1.8 });
    setLine(sole, { x: p.heel.x + 1, y: p.heel.y - 1.4 }, { x: p.toe.x + 1, y: p.toe.y - 0.6 });

    // Beine
    leg(q, { thigh: fThigh, shorts: fShorts, shank: fShank, sock: fSock, shoe: fShoe });
    leg(p, { thigh, shorts, shank, sock, shoe });
    hipCap.setAttribute('cx', f1(p.hip.x - 1)); hipCap.setAttribute('cy', f1(p.hip.y - 0.5));

    // Rumpf mit leicht gerundetem Rücken
    const tr = (torsoDeg * Math.PI) / 180, ux = Math.cos(tr), uy = Math.sin(tr), nx = -uy, ny = ux;
    const at = (base, along, off) => `${f1(base.x + ux * along + nx * off)},${f1(base.y + uy * along + ny * off)}`;
    const midB = { x: (p.hip.x + p.shoulder.x) / 2, y: (p.hip.y + p.shoulder.y) / 2 };
    torso.setAttribute('d',
      `M${at(p.hip, -4, 8.6)} Q${at(midB, 0, 13.5)} ${at(p.shoulder, 2, 6.2)} ` +
      `Q${at(p.shoulder, 6.5, 0)} ${at(p.shoulder, 1, -7)} Q${at(midB, 2, -10.5)} ${at(p.hip, 1, -8.4)} ` +
      `Q${at(p.hip, -9, -2)} ${at(p.hip, -4, 8.6)} Z`);

    // Kopf: Blick nach vorn, Nacken umso stärker überstreckt, je flacher der Rücken
    const na = (Math.max(torsoDeg + 22, 50) * Math.PI) / 180;
    const base = { x: p.shoulder.x + ux * 2, y: p.shoulder.y + uy * 2 };
    const hc = { x: base.x + 12.5 * Math.cos(na), y: base.y + 12.5 * Math.sin(na) };
    neck.setAttribute('d', limb(base, hc, 6.4, 5.4));
    head.setAttribute('cx', f1(hc.x)); head.setAttribute('cy', f1(hc.y));
    const tilt = torsoDeg * 0.35 - 22; // Neigung des Helms
    helmet.setAttribute('d', 'M-8.6,-0.4 Q-9.6,6.6 -1,7.8 Q7.2,8.4 8.6,1.6 Q4,0.6 0.5,1.2 Q-4,2 -8.6,-0.4 Z');
    helmet.setAttribute('transform', `translate(${f1(hc.x)},${f1(hc.y + 1.2)}) rotate(${f1(tilt)})`);
    const ta = (tilt * Math.PI) / 180;
    const gp = (dx, dy) => ({ x: hc.x + dx * Math.cos(ta) - dy * Math.sin(ta), y: hc.y + dx * Math.sin(ta) + dy * Math.cos(ta) });
    setLine(glasses, gp(3.4, -0.4), gp(6.4, -0.2));

    // Arm
    upperArm.setAttribute('d', limb(p.shoulder, p.elbow, 7.4, 5.8));
    sleeve.setAttribute('d', limb(p.shoulder, lerpP(p.shoulder, p.elbow, 0.42), 8.6, 7.4));
    forearm.setAttribute('d', limb(p.elbow, p.wrist, 5.8, 4.4));
    hand.setAttribute('d', limb(p.wrist, { x: p.wrist.x + (bikeParts.grip.x - bikeParts.wrist.x), y: p.wrist.y + (bikeParts.grip.y - bikeParts.wrist.y) }, 4.6, 4));

    // Mess-Overlay
    for (const [name, c] of joints) { c.setAttribute('cx', f1(p[name].x)); c.setAttribute('cy', f1(p[name].y)); }
    const a1 = Math.atan2(p.hip.y - p.knee.y, p.hip.x - p.knee.x);
    const a2 = Math.atan2(p.ankle.y - p.knee.y, p.ankle.x - p.knee.x);
    const r = 10, pt = (a) => `${f1(p.knee.x + r * Math.cos(a))},${f1(p.knee.y + r * Math.sin(a))}`;
    arc.setAttribute('d', `M${pt(a1)} A${r},${r} 0 0 0 ${pt(a2)}`);
    label.textContent = `${Math.round(angleAt(p.hip, p.knee, p.ankle))}°`;
    label.setAttribute('x', f1(p.knee.x + 10)); label.setAttribute('y', f1(-p.knee.y - 1));
    sub.setAttribute('x', f1(p.knee.x + 10)); sub.setAttribute('y', f1(-p.knee.y + 5));
  }

  if (reduced) { draw(2.2); setInterval(() => isVisible() && draw(2.2), 300); return; }
  const tick = (t) => {
    if (isVisible()) draw((t / 1000) * 2 * Math.PI * (62 / 60));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
