// Fahransicht in der Verfolgerperspektive: eine gezeichnete Straße in Pseudo-3D (wie bei klassischen
// Rennspielen), die dem Höhenprofil und den Kurven der Strecke folgt – mit dem eigenen Fahrer von hinten.
// buildCourse/courseCurvature sind reine Rechenlogik (testbar ohne Browser), createWorld zeichnet.

import { routeLength, elevationAt } from './workouts.js?v=17';

export const SEG = 5;                 // Länge eines Straßenabschnitts in Metern
export const PRE = 12;                // Abschnitte vor dem Start
const POST = 260;                     // Abschnitte hinter dem Ziel
export const EXAG = 1.6;              // Höhen leicht überhöht, damit Steigungen sichtbar werden
export const MAX_K = 1 / 18;          // engste Kurve: Radius 18 m
const DRAW = 240;                     // Sichtweite in Abschnitten (1,2 km)
const BACK = 3.2, CAM_H = 1.7, LANE = 0.9;
const DEPTH = 1 / Math.tan((50 * Math.PI) / 180);

const rng = (seed) => { let s = (seed % 2147483646) + 1; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; };
const hash = (str) => [...String(str)].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);

export const THEME_OF = { sacalobra: 'mallorca', alpedhuez: 'alps', ventoux: 'ventoux', pass: 'alps', hills: 'hills', flat: 'flat' };
const HAIRPINS = { sacalobra: 26, alpedhuez: 21, ventoux: 4, pass: 8 };
const ROAD_HALF = { mallorca: 2.9, alps: 3.3, ventoux: 3.1, hills: 3.2, flat: 3.5 };

/**
 * Krümmung je Abschnitt (1/m, positiv = Rechtskurve). Mit GPS-Track aus dessen Richtungsänderungen,
 * sonst nachgebildet: sanfte Kurven und – bei bekannten Anstiegen – die richtige Zahl an Kehren.
 */
export function courseCurvature(route) {
  const len = routeLength(route), n = Math.ceil(len / SEG) + 1;
  const k = new Float64Array(n), hairpins = [];
  const fill = (a, b, v) => {
    for (let i = Math.max(0, Math.ceil(a / SEG)); i <= Math.min(n - 1, Math.floor(b / SEG)); i++) k[i] = v;
  };
  if (route.track?.length > 2 && route.points?.length === route.track.length) {
    const pts = route.track, d = route.points.map((p) => p[0] * 1000);
    const cx = Math.cos((pts[0][0] * Math.PI) / 180);
    const head = [];
    for (let i = 0; i + 1 < pts.length; i++) head.push(Math.atan2((pts[i + 1][1] - pts[i][1]) * cx, pts[i + 1][0] - pts[i][0]));
    const at = [], kv = [];
    for (let i = 1; i < head.length; i++) {
      let dh = head[i] - head[i - 1];
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      at.push(d[i]);
      kv.push(dh / Math.max(1, (d[i + 1] - d[i - 1]) / 2));
    }
    let j = 0;
    for (let i = 0; i < n && at.length; i++) {
      const z = i * SEG;
      while (j + 1 < at.length && at[j + 1] <= z) j++;
      if (z <= at[0]) k[i] = kv[0];
      else if (j + 1 >= at.length) k[i] = kv[kv.length - 1];
      else k[i] = kv[j] + ((kv[j + 1] - kv[j]) * (z - at[j])) / (at[j + 1] - at[j]);
    }
  } else {
    const r = rng(hash(route.id ?? route.name));
    for (let pos = r() * 150; pos < len;) {
      const L = 80 + r() * 260;
      fill(pos, pos + L, (r() < 0.5 ? -1 : 1) / (120 + r() * 500));
      pos += L + 40 + r() * 200;
    }
    const H = HAIRPINS[route.id] ?? 0;
    for (let h = 0; h < H; h++) {
      const at = (len * (h + 0.5)) / H + (r() - 0.5) * (len / H) * 0.3, dir = h % 2 ? 1 : -1;
      fill(at - 28, at + 28, dir * MAX_K);
      hairpins.push({ at, dir, num: H - h });
    }
  }
  for (let i = 0; i < n; i++) k[i] = Math.max(-MAX_K, Math.min(MAX_K, k[i]));
  return { k, hairpins };
}

const SPRITE_MIX = {
  mallorca: [0.34, [['pine', 0.45], ['rock', 0.85], ['bush', 1]]],
  alps: [0.5, [['pine', 0.75], ['rock', 0.9], ['bush', 1]]],
  ventoux: [0.45, [['tree', 0.55], ['pine', 0.8], ['bush', 1]]],
  summit: [0.32, [['stone', 1]]],
  hills: [0.26, [['tree', 0.5], ['bush', 0.8], ['pine', 1]]],
  flat: [0.18, [['tree', 0.45], ['bush', 0.85], ['pine', 1]]],
};

/** Straße mit Höhe, Kurven und Randobjekten, in Abschnitte von SEG Metern zerlegt. */
export function buildCourse(route) {
  const len = routeLength(route), theme = THEME_OF[route.id] ?? 'hills', half = ROAD_HALF[theme];
  const { k, hairpins } = courseCurvature(route);
  const ele = (z) => elevationAt(route, Math.max(0, Math.min(len, z)));
  const segs = [];
  for (let j = 0; j < PRE + k.length + POST; j++) {
    const i = j - PRE, z = i * SEG, kk = i >= 0 && i < k.length ? k[i] : 0;
    segs.push({ z, y: ele(z) * EXAG, k: kk, c: kk * SEG * SEG, sprites: [] });
  }
  // Gelände neben der Straße: am Berg auf einer Seite der Hang, auf der anderen das Tal; die Seiten wechseln
  const [up, down] = { mallorca: [0.6, 0.28], alps: [0.55, 0.3], ventoux: [0.35, 0.18], hills: [0.12, 0.06], flat: [0.02, 0.01] }[theme];
  const ph = (hash(route.id ?? route.name) % 628) / 100;
  for (const sg of segs) {
    const t = Math.max(-1, Math.min(1, 1.6 * Math.sin(sg.z / 650 + ph)));
    sg.side = [t > 0 ? up * t : down * t, -t > 0 ? up * -t : down * -t];   // Anstieg je Meter links, rechts
  }
  const at = (z) => segs[Math.max(0, Math.min(segs.length - 1, Math.round(z / SEG) + PRE))];
  const r = rng(hash(route.id ?? route.name) + 99);
  for (const s of segs) {
    const [dens, mix] = SPRITE_MIX[theme === 'ventoux' && s.z > 15500 ? 'summit' : theme];
    for (const side of [-1, 1]) {
      if (r() >= dens) continue;
      const p = r();
      s.sprites.push({ t: mix.find(([, q]) => p < q)[0], x: side * (half + 2.2 + r() ** 2 * 28), v: r() });
    }
  }
  // Kilometersteine mit Restdistanz und mittlerer Steigung des nächsten Kilometers
  for (let m = 0; m * 1000 < len; m++) {
    const z = m * 1000, d = Math.min(1000, len - z);
    if (d < 200) break;
    at(z).sprites.push({ t: 'km', x: half + 1.1, km: Math.max(1, Math.round((len - z) / 1000)), g: ((ele(z + d) - ele(z)) / d) * 100 });
  }
  for (const h of hairpins) at(h.at - 40).sprites.push({ t: 'chevron', x: -h.dir * (half + 1.6), dir: h.dir, num: route.id === 'alpedhuez' ? h.num : null });
  at(0).sprites.push({ t: 'banner', x: 0, text: 'START' });
  at(len).sprites.push({ t: 'banner', x: 0, text: 'ZIEL' });
  return { segs, len, theme, half, route };
}

// ---------- Zeichnen ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const PAL = {
  mallorca: { sky: ['#a9bccd', '#f2e7d3'], fog: '#e9e1d1', far: '#aeb2b1', near: '#8f8e78', ground: ['#a39b79', '#9b9474'], verge: '#d2c9b4', sea: '#86a2b3' },
  alps: { sky: ['#93b1cd', '#eef0ea'], fog: '#e5e8e4', far: '#a3afbb', near: '#6c7b69', ground: ['#6f8957', '#698351'], verge: '#bfb9a8', snow: '#f5f5f2' },
  ventoux: { sky: ['#a3bbd0', '#f3ece0'], fog: '#ebe6dd', far: '#b3b6b4', near: '#7d8b6b', ground: ['#74885a', '#6e8255'], top: ['#dbd6cb', '#d3cec2'], verge: '#d8d2c6' },
  hills: { sky: ['#a8bed1', '#f2ebde'], fog: '#ebe5d9', far: '#adb5b2', near: '#879474', ground: ['#91a26b', '#899a64'], verge: '#cbc4af' },
  flat: { sky: ['#adc2d4', '#f3ede1'], fog: '#ece6da', far: '#b4bab6', near: '#8e9a77', ground: ['#97a76e', '#8fa067'], verge: '#cdc6b1', low: true },
};
const C = {
  road: ['#5e6063', '#5a5c5f'].map(hex), line: hex('#f3f1ec'), pine: hex('#3f5a3c'), pineDark: hex('#334a31'), tree: hex('#5c7a43'),
  treeDark: hex('#4b6737'), trunk: hex('#5a4634'), bush: hex('#6c7d4c'), rock: hex('#cbc3b1'), rockDark: hex('#a89f8c'),
  stone: hex('#e4e0d7'), white: hex('#f6f5f1'), ink: hex('#111110'), yellow: hex('#e2b23a'),
};

export function createWorld(route) {
  const course = buildCourse(route), segs = course.segs, N = segs.length;
  const base = PAL[course.theme];
  const pal = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Array.isArray(v) ? v.map(hex) : typeof v === 'string' ? hex(v) : v]));
  const mix = (c, f) => `rgb(${(c[0] + (pal.fog[0] - c[0]) * f) | 0},${(c[1] + (pal.fog[1] - c[1]) * f) | 0},${(c[2] + (pal.fog[2] - c[2]) * f) | 0})`;
  const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

  // Bergketten im Hintergrund (über 360° verteilt)
  const r = rng(hash(route.id ?? route.name) + 7);
  const ridge = (n, rough) => {
    const ph = [r(), r(), r(), r()].map((x) => x * Math.PI * 2);
    return Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      return 0.5 + 0.28 * Math.sin(t * 2 + ph[0]) + 0.16 * Math.sin(t * 5 + ph[1]) + rough * (0.1 * Math.sin(t * 11 + ph[2]) + 0.06 * Math.sin(t * 23 + ph[3]));
    });
  };
  const farR = ridge(96, 1), nearR = ridge(96, 0.7);

  // Oberfläche
  const el = document.createElement('div');
  el.className = 'world';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  el.innerHTML = `
    <div class="whud">
      <div class="wgrade"><i></i><b>0,0 %</b><small>Steigung</small></div>
      <div class="wdist"><b>0,00 km</b><small></small></div>
    </div>
    <div class="wmetrics"><div><b data-k="power">–</b><small>Watt</small></div><div><b data-k="cad">–</b><small>U/min</small></div><div><b data-k="hr">–</b><small>Puls</small></div><div><b data-k="kmh">–</b><small>km/h</small></div></div>
    <button type="button" class="wfull">Vollbild</button>`;
  el.prepend(canvas);
  const q = (s) => el.querySelector(s);
  const fullBtn = q('.wfull');
  fullBtn.onclick = () => {
    const on = !el.classList.contains('full');
    el.classList.toggle('full', on);
    document.body.classList.toggle('worldfull', on);
    fullBtn.textContent = on ? 'Vollbild beenden' : 'Vollbild';
  };

  const st = { dist: 0, v: 0, t: performance.now(), pos: 0, th: 0, sky: 0, cad: 0, power: 0, paused: false, last: performance.now(), gone: false };
  const de = (v, d = 1) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

  function update({ dist, v, grade, cad, power, hr, paused }) {
    st.dist = dist; st.v = v; st.cad = cad || 0; st.power = power || 0; st.paused = paused; st.t = performance.now();
    q('.wgrade b').textContent = `${grade > 0.05 ? '+' : ''}${de(grade)} %`;
    q('.wgrade i').style.background = grade < 2 ? '#3f6b4f' : grade < 5 ? '#c9a227' : grade < 8 ? '#d07b2c' : '#a33a2a';
    q('.wdist b').textContent = `${de(dist / 1000, 2)} km`;
    q('.wdist small').textContent = `noch ${de(Math.max(0, course.len - dist) / 1000, 1)} km · ${Math.round(elevationAt(route, Math.min(dist, course.len)))} m`;
    q('[data-k=power]').textContent = power ? Math.round(power) : '–';
    q('[data-k=cad]').textContent = cad ? Math.round(cad) : '–';
    q('[data-k=hr]').textContent = hr ? Math.round(hr) : '–';
    q('[data-k=kmh]').textContent = de(v * 3.6, 1);
  }

  const segAt = (z) => Math.max(0, Math.min(N - 2, Math.floor(z / SEG) + PRE));
  const yAt = (z) => { const j = segAt(z), s = segs[j], f = (z - s.z) / SEG; return s.y + (segs[j + 1].y - s.y) * f; };

  function drawRidge(heights, base, amp, color, offset, W, H) {
    const P = W * 4, n = heights.length;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let px = 0; px <= W + 8; px += 8) {
      const u = ((((px + offset) % P) + P) % P / P) * n, i = Math.floor(u), f = u - i;
      ctx.lineTo(px, base - (heights[i % n] * (1 - f) + heights[(i + 1) % n] * f) * amp);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function sprite(s, X, Y, m, f) {
    const c = (rgb) => mix(rgb, f);
    switch (s.t) {
      case 'pine': {
        const h = (5 + s.v * 6) * m, w = h * 0.36;
        ctx.fillStyle = c(C.trunk); ctx.fillRect(X - 0.12 * m, Y - h * 0.2, 0.24 * m, h * 0.2);
        ctx.fillStyle = c(C.pine);
        ctx.beginPath(); ctx.moveTo(X, Y - h); ctx.lineTo(X + w / 2, Y - h * 0.14); ctx.lineTo(X - w / 2, Y - h * 0.14); ctx.fill();
        ctx.fillStyle = c(C.pineDark);
        ctx.beginPath(); ctx.moveTo(X, Y - h); ctx.lineTo(X + w / 2, Y - h * 0.14); ctx.lineTo(X, Y - h * 0.14); ctx.fill();
        break;
      }
      case 'tree': {
        const h = (4 + s.v * 4) * m;
        ctx.fillStyle = c(C.trunk); ctx.fillRect(X - 0.13 * m, Y - h * 0.45, 0.26 * m, h * 0.45);
        ctx.fillStyle = c(C.tree);
        ctx.beginPath(); ctx.ellipse(X, Y - h * 0.65, h * 0.3, h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c(C.treeDark);
        ctx.beginPath(); ctx.ellipse(X + h * 0.08, Y - h * 0.6, h * 0.2, h * 0.24, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
        break;
      }
      case 'bush': {
        ctx.fillStyle = c(C.bush);
        ctx.beginPath(); ctx.ellipse(X, Y - 0.3 * m, (0.6 + s.v * 0.6) * m, 0.45 * m, 0, Math.PI, 0); ctx.fill();
        ctx.fillRect(X - (0.6 + s.v * 0.6) * m, Y - 0.3 * m, (1.2 + s.v * 1.2) * m, 0.3 * m);
        break;
      }
      case 'rock': case 'stone': {
        const z = (s.t === 'stone' ? 0.5 + s.v * 0.7 : 0.8 + s.v * 2.2) * m;
        ctx.fillStyle = c(s.t === 'stone' ? C.stone : C.rock);
        ctx.beginPath();
        [[-0.6, 0], [-0.5, -0.55], [-0.1, -0.8], [0.35, -0.65], [0.6, -0.2], [0.55, 0]].forEach(([a, b], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X + a * z, Y + b * z * (s.t === 'stone' ? 0.5 : 1)));
        ctx.fill();
        ctx.fillStyle = c(C.rockDark);
        ctx.beginPath(); ctx.moveTo(X + 0.35 * z, Y - 0.65 * z * (s.t === 'stone' ? 0.5 : 1)); ctx.lineTo(X + 0.6 * z, Y - 0.2 * z); ctx.lineTo(X + 0.55 * z, Y); ctx.lineTo(X + 0.15 * z, Y); ctx.fill();
        break;
      }
      case 'km': {
        ctx.fillStyle = c(C.white); ctx.fillRect(X - 0.17 * m, Y - 1.0 * m, 0.34 * m, 1.0 * m);
        ctx.fillStyle = c(C.yellow); ctx.fillRect(X - 0.17 * m, Y - 1.0 * m, 0.34 * m, 0.24 * m);
        if (m > 22) {
          ctx.fillStyle = css(C.ink); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = `600 ${0.15 * m}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
          ctx.fillText(`${s.km} km`, X, Y - 0.6 * m);
          ctx.font = `${0.11 * m}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
          ctx.fillText(`${de(s.g)} %`, X, Y - 0.35 * m);
        }
        break;
      }
      case 'chevron': {
        ctx.fillStyle = c(C.ink); ctx.fillRect(X - 0.04 * m, Y - 1.5 * m, 0.08 * m, 1.5 * m);
        ctx.fillStyle = c(C.white); ctx.fillRect(X - 0.5 * m, Y - 1.6 * m, 1.0 * m, 0.5 * m);
        ctx.fillStyle = c(C.ink);
        for (const o of [-0.22, 0.12]) {
          const a = X + (o * s.dir) * m, d = s.dir * 0.14 * m;
          ctx.beginPath(); ctx.moveTo(a - d, Y - 1.55 * m); ctx.lineTo(a + d, Y - 1.35 * m); ctx.lineTo(a - d, Y - 1.15 * m);
          ctx.lineTo(a - d * 0.4, Y - 1.15 * m); ctx.lineTo(a + d * 0.6, Y - 1.35 * m); ctx.lineTo(a - d * 0.4, Y - 1.55 * m); ctx.fill();
        }
        if (s.num && m > 14) {
          ctx.fillStyle = c(C.white); ctx.fillRect(X - 0.4 * m, Y - 2.2 * m, 0.8 * m, 0.45 * m);
          ctx.fillStyle = css(C.ink); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = `600 ${0.2 * m}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
          ctx.fillText(`Kehre ${s.num}`, X, Y - 1.97 * m);
        }
        break;
      }
      case 'banner': {
        const w = (course.half + 0.6) * m;
        ctx.fillStyle = c(C.ink);
        ctx.fillRect(X - w - 0.08 * m, Y - 4.4 * m, 0.16 * m, 4.4 * m);
        ctx.fillRect(X + w - 0.08 * m, Y - 4.4 * m, 0.16 * m, 4.4 * m);
        ctx.fillRect(X - w, Y - 4.4 * m, 2 * w, 0.9 * m);
        if (m > 3) {
          ctx.fillStyle = css(C.white); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = `600 ${0.5 * m}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
          ctx.fillText(s.text, X, Y - 3.95 * m);
        }
        break;
      }
      default:
    }
  }

  /** Fahrer von hinten; Maße in Metern, y nach oben. */
  function rider(X, Y, m, lean) {
    const th = st.th, bob = 0.008 * Math.sin(2 * th);
    ctx.save();
    ctx.translate(X, Y);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(0, 0, 0.36 * m, 0.06 * m, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(lean);
    ctx.scale(m, m);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const line = (pts, w, color) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([x, h], i) => (i ? ctx.lineTo(x, -h) : ctx.moveTo(x, -h))); ctx.stroke(); };
    // Hinterrad und Rahmen
    ctx.fillStyle = '#1b1b1a';
    ctx.beginPath(); ctx.roundRect(-0.022, -0.69, 0.044, 0.69, 0.02); ctx.fill();
    line([[0, 0.36], [0, 0.95]], 0.05, '#e9e8e4');
    // Beine
    for (const side of [-1, 1]) {
      const a = th + (side > 0 ? Math.PI : 0);
      const foot = [side * 0.14, 0.3 + 0.17 * Math.sin(a)], hip = [side * 0.09, 0.97 + bob];
      const knee = [side * 0.16, Math.min(hip[1] - 0.1, foot[1] + 0.44)];
      line([knee, foot], 0.09, '#d4a07f');
      line([[foot[0], foot[1] + 0.03], [foot[0], foot[1] + 0.16]], 0.088, '#f4f3ef');
      ctx.fillStyle = '#f4f3ef';
      ctx.beginPath(); ctx.roundRect(foot[0] - 0.055, -(foot[1] + 0.04), 0.11, 0.08, 0.03); ctx.fill();
      line([hip, knee], 0.15, '#1d1d1f');
    }
    // Hose, Rumpf, Lenker, Arme, Kopf
    ctx.fillStyle = '#1d1d1f';
    ctx.beginPath(); ctx.ellipse(0, -(0.98 + bob), 0.18, 0.08, 0, 0, Math.PI * 2); ctx.fill();
    line([[-0.23, 1.04], [0.23, 1.04]], 0.03, '#2a2a29');
    ctx.fillStyle = '#18181a';
    ctx.beginPath();
    ctx.moveTo(-0.17, -(0.95 + bob)); ctx.lineTo(-0.24, -(1.27 + bob)); ctx.quadraticCurveTo(0, -(1.36 + bob), 0.24, -(1.27 + bob));
    ctx.lineTo(0.17, -(0.95 + bob)); ctx.closePath(); ctx.fill();
    line([[-0.06, 1.0 + bob], [-0.1, 1.22 + bob]], 0.012, '#f4f3ef');
    for (const side of [-1, 1]) {
      const sh = [side * 0.22, 1.25 + bob], el2 = [side * 0.28, 1.12], hand = [side * 0.22, 1.04];
      line([el2, hand], 0.07, '#d4a07f');
      line([sh, el2], 0.088, '#18181a');
      line([[side * 0.235, 1.2 + bob], [side * 0.26, 1.16]], 0.09, '#18181a');
      line([[side * 0.257, 1.172], [side * 0.265, 1.155]], 0.092, '#f4f3ef');
    }
    line([[0, 1.3 + bob], [0, 1.37 + bob]], 0.075, '#c99577');
    ctx.fillStyle = '#f4f4f2';
    ctx.beginPath(); ctx.ellipse(0, -(1.43 + bob), 0.125, 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2b2a';
    for (const x of [-0.06, 0, 0.06]) { ctx.beginPath(); ctx.roundRect(x - 0.012, -(1.5 + bob), 0.024, 0.09, 0.01); ctx.fill(); }
    ctx.restore();
  }

  function frame(W, H) {
    const S = W / 2, hz = Math.round(H * 0.42);
    const pos = st.pos, camZ = pos - BACK;
    const j0 = segAt(camZ), b = segs[j0], pct = (camZ - b.z) / SEG;
    const camY = yAt(pos) + CAM_H;
    // seitliche Lage der Abschnitte (Kurven aufsummiert)
    const xs = [];
    let x = 0, dx = -b.c * pct;
    for (let n = 0; n <= DRAW && j0 + n < N; n++) { xs.push(x); x += dx; dx += segs[j0 + n].c; }
    const nr = (pos - b.z) / SEG, ni = Math.floor(nr);
    const xr = xs[ni] + (xs[Math.min(ni + 1, xs.length - 1)] - xs[ni]) * (nr - ni);
    const camX = xr + LANE;
    const proj = (px, py, pz) => { const sc = DEPTH / Math.max(0.25, pz - camZ); return [W / 2 + sc * (px - camX) * S, hz - sc * (py - camY) * S, sc * S]; };

    // Himmel und Berge
    const g = ctx.createLinearGradient(0, 0, 0, hz + 20);
    g.addColorStop(0, css(pal.sky[0])); g.addColorStop(1, css(pal.sky[1]));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const low = pal.low ? 0.35 : 1;
    drawRidge(farR, hz + 6, H * 0.26 * low, css(pal.far), st.sky * 0.6, W, H);
    if (pal.snow) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hz + 6 - H * 0.26 * 0.78); ctx.clip();
      drawRidge(farR, hz + 6, H * 0.26, css(pal.snow), st.sky * 0.6, W, H);
      ctx.restore();
    }
    if (pal.sea) { ctx.fillStyle = css(pal.sea); ctx.fillRect(0, hz - 4, W, 40); }
    drawRidge(nearR, hz + 14, H * (pal.sea ? 0.11 : 0.15) * low, css(pal.near), st.sky, W, H);
    ctx.fillStyle = mix(pal.ground[0], 0.6); ctx.fillRect(0, hz + 12, W, H);

    // Straße und Gelände von hinten nach vorn – Näheres verdeckt Ferneres
    const maxZ = DRAW * SEG;
    for (let n = xs.length - 2; n >= 0; n--) {
      const j = j0 + n, s = segs[j], s2 = segs[j + 1];
      if (s2.z - camZ <= 0.3) continue;
      const near = n === 0 || s.z - camZ < 0.3;
      const [X1, Y1a, W1] = proj(xs[n], s.y, s.z), [X2, Y2, W2] = proj(xs[n + 1], s2.y, s2.z);
      const Y1 = near ? Math.max(Y1a, H) : Y1a;
      const f = Math.min(1, Math.max(0, (s.z - camZ) / maxZ)) ** 1.3 * 0.9;
      const alt = (j >> 1) & 1;
      const ground = pal.top && s.z > 15500 ? pal.top : pal.ground;
      // Hang und Tal links und rechts der Straße
      const edge = course.half + 0.6;
      for (const [i, sign] of [[0, -1], [1, 1]]) {
        const r1 = s.side[i], r2 = s2.side[i], L = r1 > 0 ? 250 : 400;
        const a = proj(xs[n] + sign * edge, s.y, s.z), b = proj(xs[n] + sign * (edge + L), s.y + r1 * L, s.z);
        const c = proj(xs[n + 1] + sign * (edge + L), s2.y + r2 * L, s2.z), d = proj(xs[n + 1] + sign * edge, s2.y, s2.z);
        if (near) { a[1] = Math.max(a[1], H); b[1] = Math.max(b[1], r1 > 0 ? b[1] : H); }
        const base = ground[alt];
        const shade = r1 > 0 ? 1 - Math.min(0.22, r1 * 0.35) : 1;
        ctx.fillStyle = mix([base[0] * shade, base[1] * shade, base[2] * shade], f);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1; ctx.stroke();   // überdeckt feine Nahtlinien
      }
      if (Y1 > Y2) {
        const quad = (o, hw, color) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(X1 + (o - hw) * W1, Y1); ctx.lineTo(X2 + (o - hw) * W2, Y2);
          ctx.lineTo(X2 + (o + hw) * W2, Y2); ctx.lineTo(X1 + (o + hw) * W1, Y1);
          ctx.closePath(); ctx.fill();
        };
        quad(0, course.half + 0.6, mix(pal.verge, f));
        quad(0, course.half, mix(C.road[alt], f));
        quad(-(course.half - 0.25), 0.06, mix(C.line, f));
        quad(course.half - 0.25, 0.06, mix(C.line, f));
        if ((j & 3) < 2) quad(0, 0.06, mix(C.line, f));
      }
      for (const sp of s.sprites) {
        const lift = Math.max(0, Math.abs(sp.x) - course.half - 0.6) * s.side[sp.x < 0 ? 0 : 1];
        const [SX, SY, M] = proj(xs[n] + sp.x, s.y + lift, s.z);
        if (M < 0.6 || s.z - camZ < 1) continue;
        sprite(sp, SX, SY, M, f);
      }
    }

    // eigener Fahrer
    const [RX, RY, RM] = proj(xr + LANE, yAt(pos), pos);
    const k = segs[segAt(pos)].k;
    const lean = Math.max(-0.35, Math.min(0.35, (k * st.v * st.v) / 9.81)) + Math.sin(st.th) * 0.03 * Math.min(1, st.power / 350);
    rider(RX, RY, RM, lean);
  }

  let raf = 0;
  function loop(now) {
    if (!el.isConnected && st.started) { st.gone = true; return; }
    raf = requestAnimationFrame(loop);
    if (!el.isConnected) return;
    st.started = true;
    const dt = Math.min(0.1, (now - st.last) / 1000);
    st.last = now;
    const target = st.paused ? st.dist : st.dist + st.v * Math.min(1.2, (now - st.t) / 1000);
    if (target > st.pos) st.pos += (target - st.pos) * Math.min(1, dt * 8);
    if (!st.paused) {
      st.th += (st.cad / 60) * Math.PI * 2 * dt;
      st.sky += ((segs[segAt(st.pos)].k * st.v * dt) / (Math.PI * 2)) * canvas.clientWidth * 4;
    }
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    frame(w, h);
  }
  raf = requestAnimationFrame(loop);

  return {
    el, course, update,
    destroy() {
      cancelAnimationFrame(raf);
      document.body.classList.remove('worldfull');
      el.remove();
    },
  };
}
