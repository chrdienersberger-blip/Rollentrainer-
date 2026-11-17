// Fahransicht als echte 3D-Welt (WebGL, three.js): Gelände mit Detailstufen, Straße, Bäume, Felsen,
// Himmel, Sonnenlicht mit Schatten und ein 3D-Fahrer aus der Verfolgerperspektive.
// Die Straße folgt dem Höhenprofil; ihr Verlauf kommt aus dem GPS-Track oder – bei den eingebauten
// Anstiegen – aus nachgebildeten Kurven und Kehren. Die Landschaft drumherum ist erzeugt, nicht vermessen.

import * as THREE from './vendor/three.module.min.js';
import { routeLength, elevationAt } from './workouts.js?v=21';
import { courseCurvature, THEME_OF } from './world.js?v=21';
import { riderPose } from './demo.js?v=21';

const STEP = 5;            // Abstand der Straßenpunkte in Metern
const EX = 1.15;           // Höhen leicht überhöht
const HALF = { mallorca: 3.0, alps: 3.4, ventoux: 3.2, hills: 3.3, flat: 3.6 };

export const webglAvailable = () => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
};

// ---------- Hilfsfunktionen ----------
const rng = (seed) => { let s = (seed % 2147483646) + 1; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; };
const hash = (str) => [...String(str)].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function makeNoise(seed) {
  const r = rng(seed), perm = [...Array(256).keys()], p = new Uint8Array(512);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g = (h, x, y) => { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const n = (x, y) => {
    const fx = Math.floor(x), fy = Math.floor(y), X = fx & 255, Y = fy & 255;
    x -= fx; y -= fy;
    const u = fade(x), v = fade(y), a = p[X] + Y, b = p[X + 1] + Y;
    return lerp(lerp(g(p[a], x, y), g(p[b], x - 1, y), u), lerp(g(p[a + 1], x, y - 1), g(p[b + 1], x - 1, y - 1), u), v) * 0.7;
  };
  return {
    n,
    fbm(x, y, oct = 4) { let s = 0, a = 1, f = 1, t = 0; for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * a; t += a; a *= 0.5; f *= 2.03; } return s / t; },
    ridge(x, y, oct = 5) { let s = 0, a = 1, f = 1, t = 0; for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(n(x * f, y * f)); s += v * v * a; t += a; a *= 0.5; f *= 2.1; } return s / t; },
  };
}

// ---------- Straßenverlauf ----------
/** Straßenpunkte alle STEP Meter: Lage (x, z), Höhe y (überhöht) und Fahrtrichtung h. */
export function roadPath(route) {
  const len = routeLength(route), n = Math.floor(len / STEP) + 1;
  const X = new Float64Array(n), Z = new Float64Array(n), Y = new Float64Array(n), H = new Float64Array(n);
  if (route.track?.length > 2 && route.points?.length === route.track.length) {
    const lat0 = route.track[0][0], lon0 = route.track[0][1];
    const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
    const d = route.points.map((p) => p[0] * 1000);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = i * STEP;
      while (j + 2 < d.length && d[j + 1] < s) j++;
      const f = clamp((s - d[j]) / (d[j + 1] - d[j] || 1), 0, 1), a = route.track[j], b = route.track[j + 1];
      X[i] = (lerp(a[1], b[1], f) - lon0) * kx;
      Z[i] = -(lerp(a[0], b[0], f) - lat0) * ky;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      H[i] = Math.atan2(Z[b] - Z[a], X[b] - X[a]);
    }
  } else {
    const { k } = courseCurvature(route);
    let x = 0, z = 0, h = 0;
    for (let i = 0; i < n; i++) {
      X[i] = x; Z[i] = z; H[i] = h;
      h += (k[Math.min(i, k.length - 1)] ?? 0) * STEP;
      x += Math.cos(h) * STEP; z += Math.sin(h) * STEP;
    }
  }
  for (let i = 0; i < n; i++) Y[i] = elevationAt(route, Math.min(len, i * STEP)) * EX;
  return { X, Z, Y, H, n, len };
}

// ---------- Gelände ----------
function makeTerrain(route, road, theme) {
  const seed = hash(route.id ?? route.name), noise = makeNoise(seed), half = HALF[theme];
  // Straßenpunkte in einem Raster zum schnellen Nachschlagen
  const CELL = 40, cells = new Map();
  for (let i = 0; i < road.n; i++) {
    const key = `${Math.floor(road.X[i] / CELL)},${Math.floor(road.Z[i] / CELL)}`;
    (cells.get(key) ?? cells.set(key, []).get(key)).push(i);
  }
  /** nächster Punkt auf der Straße (auf die Strecke zwischen zwei Punkten projiziert) im Umkreis von 80 m */
  function nearest(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = -1, bd = 80 * 80;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const list = cells.get(`${cx + a},${cz + b}`);
      if (list) for (const i of list) { const dx = road.X[i] - x, dz = road.Z[i] - z, dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; best = i; } }
    }
    if (best < 0) return null;
    let out = { d: Math.sqrt(bd), y: road.Y[best] };
    for (const j of [best - 1, best]) {
      if (j < 0 || j + 1 >= road.n) continue;
      const ax = road.X[j], az = road.Z[j], bx = road.X[j + 1], bz = road.Z[j + 1];
      const vx = bx - ax, vz = bz - az, t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1), 0, 1);
      const px = ax + vx * t, pz = az + vz * t, dd = Math.hypot(x - px, z - pz);
      if (dd < out.d) out = { d: dd, y: lerp(road.Y[j], road.Y[j + 1], t) };
    }
    return out;
  }

  // Grobes Höhenfeld: zwischen den Straßenstücken glatt aufgefüllt (harmonisch), dazu Abstand zur Straße
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, mean = 0;
  for (let i = 0; i < road.n; i++) { minX = Math.min(minX, road.X[i]); maxX = Math.max(maxX, road.X[i]); minZ = Math.min(minZ, road.Z[i]); maxZ = Math.max(maxZ, road.Z[i]); mean += road.Y[i]; }
  mean /= road.n;
  const CF = 60, M = 4000, fx0 = minX - M, fz0 = minZ - M;
  const W = Math.ceil((maxX - minX + 2 * M) / CF) + 1, Hh = Math.ceil((maxZ - minZ + 2 * M) / CF) + 1;
  const val = new Float32Array(W * Hh).fill(mean), fixed = new Uint8Array(W * Hh), sum = new Float32Array(W * Hh), cnt = new Uint16Array(W * Hh);
  for (let i = 0; i < road.n; i++) {
    const c = Math.round((road.X[i] - fx0) / CF) + Math.round((road.Z[i] - fz0) / CF) * W;
    sum[c] += road.Y[i]; cnt[c]++;
  }
  for (let c = 0; c < val.length; c++) if (cnt[c]) { val[c] = sum[c] / cnt[c]; fixed[c] = 1; }
  for (let it = 0; it < 160; it++) {
    for (let zz = 0; zz < Hh; zz++) for (let xx = 0; xx < W; xx++) {
      const c = xx + zz * W;
      if (fixed[c]) continue;
      let s = 0, k = 0;
      if (xx > 0) { s += val[c - 1]; k++; } if (xx < W - 1) { s += val[c + 1]; k++; }
      if (zz > 0) { s += val[c - W]; k++; } if (zz < Hh - 1) { s += val[c + W]; k++; }
      val[c] += 1.85 * (s / k - val[c]);
    }
  }
  const dist = new Float32Array(W * Hh);
  for (let c = 0; c < dist.length; c++) dist[c] = fixed[c] ? 0 : 1e9;
  for (let zz = 0; zz < Hh; zz++) for (let xx = 0; xx < W; xx++) {
    const c = xx + zz * W;
    if (xx > 0) dist[c] = Math.min(dist[c], dist[c - 1] + CF);
    if (zz > 0) dist[c] = Math.min(dist[c], dist[c - W] + CF);
  }
  for (let zz = Hh - 1; zz >= 0; zz--) for (let xx = W - 1; xx >= 0; xx--) {
    const c = xx + zz * W;
    if (xx < W - 1) dist[c] = Math.min(dist[c], dist[c + 1] + CF);
    if (zz < Hh - 1) dist[c] = Math.min(dist[c], dist[c + W] + CF);
  }
  const field = (arr, x, z) => {
    const u = clamp((x - fx0) / CF, 0, W - 1.001), v = clamp((z - fz0) / CF, 0, Hh - 1.001);
    const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, c = i + j * W;
    return lerp(lerp(arr[c], arr[c + 1], a), lerp(arr[c + W], arr[c + W + 1], a), b);
  };

  const A = { mallorca: 420, alps: 760, ventoux: 240, hills: 70, flat: 8 }[theme];
  const B = { mallorca: 32, alps: 45, ventoux: 22, hills: 16, flat: 3 }[theme];
  const sx = road.X[0], sz = road.Z[0];
  const info = { d: 0 };
  /** Geländehöhe (überhöht) an (x, z); info.d = Abstand zur Straße */
  function height(x, z) {
    const near = nearest(x, z), d = near ? near.d : field(dist, x, z);
    info.d = d;
    let h = field(val, x, z)
      + A * noise.ridge(x / 1500, z / 1500) * smooth(40, 1100, d)
      + B * noise.fbm(x / 190, z / 190) * smooth(10, 140, d)
      + 0.9 * noise.fbm(x / 23, z / 23, 3) * smooth(half + 2, 25, d);
    if (theme === 'mallorca') h -= 260 * (1 - smooth(300, 1900, Math.hypot(x - sx, z - sz))) * smooth(50, 320, d);   // Bucht am Start
    if (!near) return h;
    return lerp(near.y - 0.3, h, smooth(half + 1.2, half + 26, near.d));
  }
  return { height, info, noise, half };
}

// ---------- Farben ----------
const col = (hex) => new THREE.Color(hex);
const PALETTE = {
  mallorca: { a: col('#a59c76'), b: col('#76804f'), rock: col('#cfc7b5'), forest: col('#58663f'), sky: ['#7fa6c8', '#f3e7d1'], sea: '#4f86a3' },
  alps: { a: col('#7c9b56'), b: col('#5f7f45'), rock: col('#8d8c87'), forest: col('#3c5636'), snow: col('#f3f4f6'), sky: ['#6f9ccc', '#e9eef2'] },
  ventoux: { a: col('#6f8a52'), b: col('#5c7646'), rock: col('#d9d4c9'), forest: col('#4a633b'), sky: ['#83a9cc', '#f1ebe0'] },
  hills: { a: col('#8eab62'), b: col('#a8b56c'), rock: col('#9b968a'), forest: col('#4c6a3c'), sky: ['#86abcc', '#f1ece2'] },
  flat: { a: col('#97ae66'), b: col('#b7b874'), rock: col('#a29d90'), forest: col('#506d3f'), sky: ['#8cb0cf', '#f2eee4'] },
};
const GRAVEL = col('#b9b1a0');

function texture(draw, w, h, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWorld3D(route) {
  const theme = THEME_OF[route.id] ?? 'hills', pal = PALETTE[theme];
  const road = roadPath(route), terrain = makeTerrain(route, road, theme), half = terrain.half, noise = terrain.noise;
  const len = road.len;

  // ---------- Oberfläche (wie die einfache Ansicht) ----------
  const el = document.createElement('div');
  el.className = 'world world3d';
  el.innerHTML = `
    <div class="whud">
      <div class="wgrade"><i></i><b>0,0 %</b><small>Steigung</small></div>
      <div class="wdist"><b>0,00 km</b><small></small></div>
    </div>
    <div class="wmetrics"><div><b data-k="power">–</b><small>Watt</small></div><div><b data-k="cad">–</b><small>U/min</small></div><div><b data-k="hr">–</b><small>Puls</small></div><div><b data-k="kmh">–</b><small>km/h</small></div></div>
    <div class="wload">Welt wird erzeugt …</div>
    <button type="button" class="wfull">Vollbild</button>`;
  const q = (s) => el.querySelector(s);
  const fullBtn = q('.wfull');
  fullBtn.onclick = () => {
    const on = !el.classList.contains('full');
    el.classList.toggle('full', on);
    document.body.classList.toggle('worldfull', on);
    fullBtn.textContent = on ? 'Vollbild beenden' : 'Vollbild';
  };
  const de = (v, d = 1) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

  // ---------- Szene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  el.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const horizon = new THREE.Color(pal.sky[1]);
  scene.fog = new THREE.Fog(horizon, 180, 6200);
  scene.background = horizon;
  const camera = new THREE.PerspectiveCamera(62, 16 / 10, 0.1, 12000);

  // Himmel: Verlauf vom Horizont nach oben, mit Sonne
  {
    const g = new THREE.SphereGeometry(9000, 32, 16), top = new THREE.Color(pal.sky[0]), colors = [];
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const t = clamp(pos.getY(i) / 9000, 0, 1) ** 0.55; const c = horizon.clone().lerp(top, t); colors.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1;
    scene.add(sky);
    scene.userData.sky = sky;
  }
  const sunDir = new THREE.Vector3(-0.55, 0.62, 0.55).normalize();
  {
    const sun = new THREE.Mesh(new THREE.CircleGeometry(260, 32), new THREE.MeshBasicMaterial({ color: '#fff6e0', fog: false, depthWrite: false }));
    sun.position.copy(sunDir).multiplyScalar(8500);
    sun.lookAt(0, 0, 0);
    scene.userData.sky.add(sun);
  }
  scene.add(new THREE.HemisphereLight('#e4ecf3', '#6b6450', 1.05));
  const light = new THREE.DirectionalLight('#fff0d8', 2.1);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 80 });
  light.shadow.bias = -0.0008;
  scene.add(light, light.target);
  if (pal.sea) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshLambertMaterial({ color: pal.sea }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(road.X[0], 0, road.Z[0]);
    scene.add(sea);
  }

  // ---------- Materialien ----------
  const detail = texture((c, w, h) => {
    const nz = makeNoise(11), img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // kachelbar: Rauschen auf einem Torus abgetastet
      const a = (x / w) * Math.PI * 2, b = (y / h) * Math.PI * 2;
      const v = nz.fbm(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + Math.cos(b) * 3, 4) + 0.5 * nz.n(Math.sin(b) * 9 + 4, Math.cos(a) * 9);
      const g = clamp(232 + v * 38, 195, 255);
      img.data.set([g, g, g * 0.99, 255], (x + y * w) * 4);
    }
    c.putImageData(img, 0, 0);
  }, 256, 256);
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail });
  const farMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 3 });
  const farUniforms = { uCam: { value: new THREE.Vector2() }, uR: { value: 0 } };
  farMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, farUniforms);
    sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform vec2 uCam; uniform float uR; varying vec3 vWp;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (distance(vWp.xz, uCam) < uR) discard;');
  };
  const roadTex = texture((c, w, h) => {
    const r = rng(9);
    c.fillStyle = '#56585b'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 70 + r() * 50; c.fillStyle = `rgb(${v},${v},${v + 3})`; c.fillRect(r() * w, r() * h, 1.5, 1.5); }
    c.fillStyle = '#ecebe6';
    c.fillRect(w * 0.035, 0, w * 0.035, h); c.fillRect(w * 0.93, 0, w * 0.035, h);
    c.fillRect(w * 0.49, 0, w * 0.022, h * 0.3);
  }, 256, 512);
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  // ---------- Straße ----------
  const roadAt = (s) => {
    const f = clamp(s / STEP, 0, road.n - 1.0001), i = Math.floor(f), t = f - i;
    let dh = road.H[i + 1] - road.H[i];
    while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    return { x: lerp(road.X[i], road.X[i + 1], t), z: lerp(road.Z[i], road.Z[i + 1], t), y: lerp(road.Y[i], road.Y[i + 1], t), h: road.H[i] + dh * t, i };
  };
  const PIECE = 80;
  for (let p0 = 0; p0 < road.n - 1; p0 += PIECE) {
    const p1 = Math.min(road.n - 1, p0 + PIECE), pos = [], uv = [], idx = [];
    for (let i = p0; i <= p1; i++) {
      const rx = -Math.sin(road.H[i]), rz = Math.cos(road.H[i]), y = road.Y[i] + 0.06;
      pos.push(road.X[i] - rx * half, y, road.Z[i] - rz * half, road.X[i] + rx * half, y, road.Z[i] + rz * half);
      uv.push(0, (i * STEP) / 10, 1, (i * STEP) / 10);
      if (i > p0) { const a = (i - p0 - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, roadMat);
    m.receiveShadow = true;
    scene.add(m);
  }
  // Leitpfosten alle 50 m und Kilometerschilder
  {
    const count = Math.floor(len / 50) * 2, body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1, 0.12), new THREE.MeshLambertMaterial({ color: '#f1f0ec' }), count);
    const cap = new THREE.InstancedMesh(new THREE.BoxGeometry(0.105, 0.22, 0.125), new THREE.MeshLambertMaterial({ color: '#1b1b1a' }), count);
    const mtx = new THREE.Matrix4();
    let n = 0;
    for (let s = 50; s < len; s += 50) {
      const r = roadAt(s), rx = -Math.sin(r.h), rz = Math.cos(r.h);
      for (const side of [-1, 1]) {
        const x = r.x + rx * side * (half + 1.1), z = r.z + rz * side * (half + 1.1);
        mtx.makeRotationY(-r.h).setPosition(x, r.y + 0.5, z); body.setMatrixAt(n, mtx);
        mtx.makeRotationY(-r.h).setPosition(x, r.y + 0.82, z); cap.setMatrixAt(n, mtx);
        n++;
      }
    }
    body.count = cap.count = n;
    scene.add(body, cap);
    const km = (text, sub) => texture((c, w, h) => {
      c.fillStyle = '#f6f5f1'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e2b23a'; c.fillRect(0, 0, w, h * 0.28);
      c.fillStyle = '#111110'; c.textAlign = 'center'; c.font = '600 54px Helvetica, Arial, sans-serif';
      c.fillText(text, w / 2, h * 0.58);
      c.font = '40px Helvetica, Arial, sans-serif'; c.fillText(sub, w / 2, h * 0.84);
    }, 256, 256, false);
    for (let m = 0; m * 1000 < len - 200; m++) {
      const s = Math.max(8, m * 1000), r = roadAt(s), d = Math.min(1000, len - s);
      const g = ((elevationAt(route, s + d) - elevationAt(route, s)) / d) * 100;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshLambertMaterial({ map: km(`${Math.max(1, Math.round((len - s) / 1000))} km`, `${de(g)} %`) }));
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.08), new THREE.MeshLambertMaterial({ color: '#f1f0ec' }));
      const rx = -Math.sin(r.h), rz = Math.cos(r.h), x = r.x + rx * (half + 1.6), z = r.z + rz * (half + 1.6);
      post.position.set(x, r.y + 0.45, z); post.rotation.y = -r.h + Math.PI / 2;
      sign.position.set(x - Math.cos(r.h) * 0.05, r.y + 0.62, z - Math.sin(r.h) * 0.05); sign.rotation.y = -r.h - Math.PI / 2;
      scene.add(post, sign);
    }
    // Start- und Zielbogen
    for (const [s, text] of [[3, 'START'], [len - 1, 'ZIEL']]) {
      const r = roadAt(s), rx = -Math.sin(r.h), rz = Math.cos(r.h), g = new THREE.Group(), w = half + 0.6;
      const ink = new THREE.MeshLambertMaterial({ color: '#111110' });
      for (const side of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.6, 0.18), ink); p.position.set(0, 2.3, side * w); g.add(p); }
      const banner = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 2 * w + 0.2), [ink, ink, ink, ink,
        new THREE.MeshLambertMaterial({ map: texture((c, W, H) => { c.fillStyle = '#111110'; c.fillRect(0, 0, W, H); c.fillStyle = '#f3f1ec'; c.font = '600 70px Helvetica, Arial, sans-serif'; c.textAlign = 'center'; c.fillText(text, W / 2, H * 0.7); }, 512, 96, false) }), ink]);
      banner.position.set(0, 4.15, 0); banner.rotation.y = Math.PI;
      g.add(banner);
      g.position.set(r.x, r.y, r.z); g.rotation.y = -r.h;
      scene.add(g);
      void rx; void rz;
    }
  }

  // ---------- Geländestücke mit Detailstufen ----------
  const SIZE = 240, LOD = [{ seg: 48, r: 360 }, { seg: 16, r: 1300 }];
  const FAR = { size: 1920, seg: 40, r: 7200 };
  const chunks = new Map(), farChunks = new Map();
  // Nadelbaum aus drei gestuften Kegeln
  const pineGeo = (() => {
    const parts = [[1, 0.62, 0], [0.78, 0.5, 0.3], [0.52, 0.42, 0.58]].map(([r, h, y]) => new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2, 0).toNonIndexed());
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const arrays = parts.map((p) => p.attributes[name].array), out = new Float32Array(arrays.reduce((a, b) => a + b.length, 0));
      let o = 0; for (const a of arrays) { out.set(a, o); o += a.length; }
      g.setAttribute(name, new THREE.BufferAttribute(out, parts[0].attributes[name].itemSize));
    }
    return g;
  })();
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 1, 5).translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const treeMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const UPV = new THREE.Vector3(0, 1, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#5a4634' });
  const rockMat = new THREE.MeshLambertMaterial({ color: pal.rock });

  function groundColor(hy, slope, x, z, d, out) {
    const hr = hy / EX, f = noise.fbm(x / 140, z / 140, 3), forest = noise.fbm(x / 420 + 7, z / 420 - 3, 3);
    out.copy(pal.a).lerp(pal.b, clamp(0.5 + f * 1.6, 0, 1));
    if (pal.snow && hr > 2250 + f * 300 && slope < 0.75) out.copy(pal.snow);
    else if (theme === 'ventoux' && hr > 1420 + f * 120) out.copy(pal.rock);
    else if (forest > 0.08 && slope < 0.8 && !(theme === 'alps' && hr > 2000)) out.lerp(pal.forest, smooth(0.08, 0.25, forest) * 0.85);
    if (slope > 0.55) out.lerp(pal.rock, smooth(0.55, 0.85, slope));
    if (d < half + 2.5) out.lerp(GRAVEL, 1 - smooth(half + 0.6, half + 2.5, d));
    return out;
  }
  function treeDensity(hy, slope, x, z, d) {
    const hr = hy / EX, forest = noise.fbm(x / 420 + 7, z / 420 - 3, 3);
    if (d < half + 4 || slope > 0.8 || hy < 0.5) return 0;
    if (theme === 'ventoux' && hr > 1420) return 0;
    if (theme === 'alps' && hr > 2100) return 0;
    const base = { mallorca: 0.06, alps: 0.08, ventoux: 0.1, hills: 0.025, flat: 0.01 }[theme];
    return base + smooth(0.02, 0.25, forest) * { mallorca: 0.3, alps: 0.65, ventoux: 0.65, hills: 0.4, flat: 0.22 }[theme];
  }

  function buildGrid(x0, z0, size, seg, skirt, mat, recv) {
    const n = seg + 1, m = n + 2, step = size / seg, hs = new Float32Array(m * m), ds = new Float32Array(m * m);
    // Höhen mit einer Zeile Rand rundherum: so sind die Normalen an den Grenzen zweier Stücke gleich
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { const k = i + j * m; hs[k] = terrain.height(x0 + (i - 1) * step, z0 + (j - 1) * step); ds[k] = terrain.info.d; }
    const pos = [], nor = [], colors = [], uv = [], idx = [], c = new THREE.Color(), nv = new THREE.Vector3();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = i + 1 + (j + 1) * m, x = x0 + i * step, z = z0 + j * step;
      const gx = (hs[k + 1] - hs[k - 1]) / (2 * step), gz = (hs[k + m] - hs[k - m]) / (2 * step);
      nv.set(-gx, 1, -gz).normalize();
      groundColor(hs[k], (1 - nv.y) * 2.2, x, z, ds[k], c);
      pos.push(x, hs[k], z); nor.push(nv.x, nv.y, nv.z); colors.push(c.r, c.g, c.b); uv.push(x / 9, z / 9);
    }
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = i + j * n; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
    if (skirt) {
      // senkrechte Schürze am Rand verdeckt Spalten zwischen unterschiedlich feinen Stücken
      const ring = [];
      for (let i = 0; i < n; i++) ring.push(i);
      for (let j = 1; j < n; j++) ring.push(seg + j * n);
      for (let i = seg - 1; i >= 0; i--) ring.push(i + seg * n);
      for (let j = seg - 1; j >= 1; j--) ring.push(j * n);
      ring.push(0);
      const top = pos.length / 3;
      ring.forEach((k) => { pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); nor.push(nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]); colors.push(colors[k * 3], colors[k * 3 + 1], colors[k * 3 + 2]); uv.push(uv[k * 2], uv[k * 2 + 1]); });
      const bot = pos.length / 3;
      ring.forEach((k) => { pos.push(pos[k * 3], pos[k * 3 + 1] - skirt, pos[k * 3 + 2]); nor.push(nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]); colors.push(colors[k * 3], colors[k * 3 + 1], colors[k * 3 + 2]); uv.push(uv[k * 2], uv[k * 2 + 1]); });
      for (let r = 1; r < ring.length; r++) { const a = top + r - 1, b = top + r, a2 = bot + r - 1, b2 = bot + r; idx.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = recv;
    return { mesh };
  }

  function buildChunk(cx, cz, lod) {
    const x0 = cx * SIZE, z0 = cz * SIZE, group = new THREE.Group();
    const { mesh } = buildGrid(x0, z0, SIZE, LOD[lod].seg, 25, groundMat, lod === 0);
    group.add(mesh);
    // Bäume und Felsen, immer gleich verteilt (Zufall mit fester Saat je Stück)
    const r = rng(hash(`${cx},${cz}`) + 3), spacing = lod === 0 ? 7 : 11, pines = [], broad = [], rocks = [];
    for (let z = z0 + r() * spacing; z < z0 + SIZE; z += spacing) for (let x = x0 + r() * spacing; x < x0 + SIZE; x += spacing) {
      const px = x + (r() - 0.5) * spacing, pz = z + (r() - 0.5) * spacing;
      const hy = terrain.height(px, pz), d = terrain.info.d, h2 = terrain.height(px + 2, pz);
      const slope = Math.abs(h2 - hy) / 2;
      const p = treeDensity(hy, slope, px, pz, d), roll = r();
      if (roll < p) (theme === 'alps' || theme === 'mallorca' || r() < 0.45 ? pines : broad).push([px, hy, pz, 0.7 + r() * 0.7, r()]);
      else if (lod === 0 && roll > 0.985 - (theme === 'mallorca' || theme === 'ventoux' ? 0.02 : 0) && d > half + 3) rocks.push([px, hy, pz, 0.4 + r() * 1.4, r()]);
    }
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), tint = new THREE.Color();
    if (pines.length) {
      const crowns = new THREE.InstancedMesh(pineGeo, treeMat, pines.length), trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, pines.length);
      pines.forEach(([x, y, z, k, v], i) => {
        const h = (theme === 'mallorca' ? 7 : 10) * k;
        mtx.compose(p.set(x, y + h * 0.12, z), q.setFromAxisAngle(UPV, v * 6), s.set(h * 0.24, h * 0.9, h * 0.24)); crowns.setMatrixAt(i, mtx);
        mtx.compose(p.set(x, y - 0.3, z), q, s.set(1, h * 0.3, 1)); trunks.setMatrixAt(i, mtx);
        crowns.setColorAt(i, tint.copy(pal.forest).multiplyScalar(0.75 + v * 0.45));
      });
      group.add(crowns, trunks);
    }
    if (broad.length) {
      const crowns = new THREE.InstancedMesh(crownGeo, treeMat, broad.length), trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, broad.length);
      broad.forEach(([x, y, z, k, v], i) => {
        const h = 7 * k;
        mtx.compose(p.set(x, y + h * 0.62, z), q.setFromEuler(new THREE.Euler(v * 3, v * 5, 0)), s.set(h * 0.34, h * 0.32, h * 0.34)); crowns.setMatrixAt(i, mtx);
        mtx.compose(p.set(x, y - 0.3, z), q.identity(), s.set(1.3, h * 0.5, 1.3)); trunks.setMatrixAt(i, mtx);
        crowns.setColorAt(i, tint.copy(pal.forest).lerp(pal.b, 0.35).multiplyScalar(0.8 + v * 0.4));
      });
      group.add(crowns, trunks);
    }
    if (rocks.length) {
      const m = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
      rocks.forEach(([x, y, z, k, v], i) => { mtx.compose(p.set(x, y + k * 0.25, z), q.setFromEuler(new THREE.Euler(v * 6, v * 4, v * 2)), s.set(k * 1.3, k * 0.8, k)); m.setMatrixAt(i, mtx); });
      group.add(m);
    }
    return group;
  }

  function dispose(obj) {
    scene.remove(obj);
    obj.traverse((o) => { if (o.geometry && ![pineGeo, trunkGeo, crownGeo, rockGeo].includes(o.geometry)) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
  }

  /** Stücke rund um die Kamera aufbauen bzw. abbauen; budget = wie viel Zeit (ms) pro Bild höchstens dafür draufgeht */
  function updateChunks(cx, cz, budget) {
    const t0 = performance.now(), wanted = [];
    const rIdx = Math.ceil(LOD[1].r / SIZE) + 1, ci = Math.floor(cx / SIZE), cj = Math.floor(cz / SIZE);
    const keep = new Set();
    for (let j = cj - rIdx; j <= cj + rIdx; j++) for (let i = ci - rIdx; i <= ci + rIdx; i++) {
      const d = Math.hypot((i + 0.5) * SIZE - cx, (j + 0.5) * SIZE - cz);
      if (d > LOD[1].r + SIZE * 0.7) continue;
      const lod = d < LOD[0].r ? 0 : 1, key = `${i},${j}`;
      keep.add(key);
      const have = chunks.get(key);
      if (!have || have.lod !== lod) wanted.push({ key, i, j, lod, d });
    }
    for (const [key, c] of chunks) if (!keep.has(key)) { dispose(c.group); chunks.delete(key); }
    wanted.sort((a, b) => a.d - b.d);
    for (const w of wanted) {
      if (performance.now() - t0 > budget) break;
      const old = chunks.get(w.key), group = buildChunk(w.i, w.j, w.lod);
      scene.add(group);
      if (old) dispose(old.group);
      chunks.set(w.key, { group, lod: w.lod });
    }
    // ferne Berge: große, grobe Stücke; innerhalb des Nahbereichs ausgeblendet
    farUniforms.uCam.value.set(cx, cz);
    farUniforms.uR.value = LOD[1].r - 120;
    const fi = Math.floor(cx / FAR.size), fj = Math.floor(cz / FAR.size), fr = Math.ceil(FAR.r / FAR.size), keepFar = new Set();
    for (let j = fj - fr; j <= fj + fr; j++) for (let i = fi - fr; i <= fi + fr; i++) {
      if (Math.hypot((i + 0.5) * FAR.size - cx, (j + 0.5) * FAR.size - cz) > FAR.r + FAR.size) continue;
      const key = `${i},${j}`;
      keepFar.add(key);
      if (!farChunks.has(key) && performance.now() - t0 < budget) {
        const { mesh } = buildGrid(i * FAR.size, j * FAR.size, FAR.size, FAR.seg, 0, farMat, false);
        scene.add(mesh);
        farChunks.set(key, mesh);
      }
    }
    for (const [key, m] of farChunks) if (!keepFar.has(key)) { dispose(m); farChunks.delete(key); }
    return wanted.length;
  }

  // ---------- Fahrer ----------
  const rider = new THREE.Group();
  rider.rotation.order = 'YZX';
  scene.add(rider);
  const M = (color, rough = 0.7) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  const kit = M('#18181a', 0.6), skin = M('#d4a07f', 0.8), white = M('#f2f2ef', 0.4), frameMat = M('#ecebe7', 0.35), black = M('#151515', 0.5), rim = M('#2a2a2a', 0.4);
  const UP = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  const limb = (r, mat, r2 = r) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, 1, 10), mat); m.castShadow = true; rider.add(m); return m; };
  const ball = (r, mat) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat); m.castShadow = true; rider.add(m); return m; };
  const place = (m, a, b) => { tmp.subVectors(b, a); const L = tmp.length(); m.position.copy(a).addScaledVector(tmp, 0.5); m.scale.set(1, L, 1); m.quaternion.setFromUnitVectors(UP, tmp.normalize()); };
  const v3 = (p, z) => new THREE.Vector3(p.x / 100, (p.y + 27) / 100, z);
  // Rad (Maße wie in der Zeichnung, in Metern; Tretlager im Ursprung)
  const wheels = [-0.41, 0.59].map((x) => {
    const w = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.014, 8, 40), black);
    const deep = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.03, 6, 40), rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8).rotateX(Math.PI / 2), M('#9a9a9a'));
    tyre.castShadow = deep.castShadow = true;
    w.add(tyre, deep, hub);
    for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.56, 0.004), M('#777777')); sp.rotation.z = (k * Math.PI) / 4; w.add(sp); }
    w.position.set(x, 0.34, 0);
    rider.add(w);
    return w;
  });
  const P = (x, y) => new THREE.Vector3(x / 100, (y + 27) / 100, 0);
  const BB = P(0, 0), ST = P(-15.2, 49.7), HT1 = P(41, 56), HT2 = P(44.5, 44), RW = P(-41, 7), FW = P(59, 7);
  for (const [a, b, r] of [[BB, ST, 0.022], [ST, HT1, 0.018], [BB, HT2, 0.028], [HT2, HT1, 0.025], [HT2, FW, 0.018], [BB, RW, 0.012], [ST, RW, 0.011]]) place(limb(r, frameMat), a, b);
  place(limb(0.014, black), ST, P(-20, 64));
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.12), black); saddle.position.copy(P(-21, 66)); saddle.castShadow = true; rider.add(saddle);
  place(limb(0.018, black), HT1, P(53, 60.5));
  const bar = limb(0.014, black); place(bar, new THREE.Vector3(0.53, 0.875, -0.21), new THREE.Vector3(0.53, 0.875, 0.21));
  const chainring = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 24).rotateX(Math.PI / 2), M('#3a3a3a', 0.3)); chainring.position.copy(BB).setZ(0.05); rider.add(chainring);
  // Körperteile, werden jedes Bild neu gesetzt
  const parts = {
    thighs: [limb(0.062, kit, 0.07), limb(0.062, kit, 0.07)], shins: [limb(0.04, skin, 0.05), limb(0.04, skin, 0.05)],
    socks: [limb(0.042, white), limb(0.042, white)], shoes: [ball(0.05, white), ball(0.05, white)], knees: [ball(0.052, skin), ball(0.052, skin)],
    cranks: [limb(0.012, black), limb(0.012, black)],
    torso: limb(0.12, kit, 0.15), hips: ball(0.12, kit),
    upper: [limb(0.042, kit), limb(0.042, kit)], fore: [limb(0.032, skin), limb(0.034, skin)], elbows: [ball(0.04, skin), ball(0.04, skin)],
    neck: limb(0.045, skin), head: ball(0.1, skin), helmet: ball(0.125, white),
  };
  parts.helmet.scale.set(1.25, 0.85, 1.02);
  const pose = (th, torsoDeg) => {
    for (const [side, z] of [[0, -1], [1, 1]]) {
      const ps = riderPose(th + (side ? Math.PI : 0), { torsoDeg, wristOffset: { x: 74, y: -10 } });
      const hip = v3(ps.hip, z * 0.1), knee = v3(ps.knee, z * 0.13), ankle = v3(ps.ankle, z * 0.12), toe = v3(ps.toe, z * 0.12), sp = v3(ps.spindle, z * 0.11);
      place(parts.thighs[side], hip, knee); place(parts.shins[side], knee, ankle);
      place(parts.socks[side], ankle, ankle.clone().lerp(knee, 0.22));
      parts.shoes[side].position.copy(ankle).lerp(toe, 0.5); parts.shoes[side].scale.set(2.2, 0.8, 0.9);
      parts.knees[side].position.copy(knee);
      place(parts.cranks[side], BB.clone().setZ(z * 0.07), sp);
      if (!side) {
        const sh = v3(ps.shoulder, 0), hipC = v3(ps.hip, 0);
        place(parts.torso, hipC, sh); parts.hips.position.copy(hipC);
        const dir = sh.clone().sub(hipC).normalize(), head = sh.clone().addScaledVector(dir, 0.08).add(new THREE.Vector3(0.06, 0.13, 0));
        place(parts.neck, sh, head); parts.head.position.copy(head); parts.helmet.position.copy(head).add(new THREE.Vector3(-0.015, 0.045, 0));
        parts.helmet.rotation.z = -0.25;
      }
      const shoulder = v3(ps.shoulder, z * 0.19), elbow = v3(ps.elbow, z * 0.22), wrist = v3(ps.wrist, z * 0.21);
      place(parts.upper[side], shoulder, elbow); place(parts.fore[side], elbow, wrist); parts.elbows[side].position.copy(elbow);
    }
  };

  // ---------- Bewegung, Kamera ----------
  const st = { dist: 0, v: 0, t: performance.now(), pos: 0, th: 0, cad: 0, power: 0, paused: false, last: performance.now(), camH: road.H[0], ready: false };
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();
  function update({ dist, v, grade, cad, power, hr, paused }) {
    if (!st.init || dist < st.pos - 50 || dist > st.pos + 200) st.pos = dist;   // Sprung (Start, neue Position): nicht hingleiten
    st.init = true;
    st.dist = dist; st.v = v; st.cad = cad || 0; st.power = power || 0; st.paused = paused; st.t = performance.now();
    q('.wgrade b').textContent = `${grade > 0.05 ? '+' : ''}${de(grade)} %`;
    q('.wgrade i').style.background = grade < 2 ? '#3f6b4f' : grade < 5 ? '#c9a227' : grade < 8 ? '#d07b2c' : '#a33a2a';
    q('.wdist b').textContent = `${de(dist / 1000, 2)} km`;
    q('.wdist small').textContent = `noch ${de(Math.max(0, len - dist) / 1000, 1)} km · ${Math.round(elevationAt(route, Math.min(dist, len)))} m`;
    q('[data-k=power]').textContent = power ? Math.round(power) : '–';
    q('[data-k=cad]').textContent = cad ? Math.round(cad) : '–';
    q('[data-k=hr]').textContent = hr ? Math.round(hr) : '–';
    q('[data-k=kmh]').textContent = de(v * 3.6, 1);
  }

  let raf = 0, gone = false;
  function frame(now) {
    if (gone) return;
    raf = requestAnimationFrame(frame);
    if (!el.isConnected) return;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    const cv = renderer.domElement;
    if (cv.width !== Math.round(w * renderer.getPixelRatio()) || cv.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    const dt = Math.min(0.1, (now - st.last) / 1000);
    st.last = now;
    const target = st.paused ? st.dist : st.dist + st.v * Math.min(1.2, (now - st.t) / 1000);
    if (target > st.pos) st.pos += (target - st.pos) * Math.min(1, dt * 8);
    if (!st.paused) st.th += (st.cad / 60) * Math.PI * 2 * dt;

    const r = roadAt(Math.min(st.pos, len)), ahead = roadAt(Math.min(st.pos + 4, len));
    const grade = (ahead.y - r.y) / 4, rx = -Math.sin(r.h), rz = Math.cos(r.h);
    const k = (() => { let dh = ahead.h - r.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; return dh / 4; })();
    const lane = 0.9;
    rider.position.set(r.x + rx * lane, r.y + 0.06, r.z + rz * lane);
    rider.rotation.set(clamp(Math.atan((k * st.v * st.v) / 9.81), -0.4, 0.4) + Math.sin(st.th) * 0.025 * Math.min(1, st.power / 350), -r.h, Math.atan(grade));
    pose(st.th, 40);
    for (const wh of wheels) wh.rotation.z -= (st.paused ? 0 : st.v * dt) / 0.34;
    chainring.rotation.z = -st.th;

    // Kamera folgt mit etwas Verzögerung, damit Kehren nicht ruckeln
    let dh = r.h - st.camH; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    st.camH += dh * Math.min(1, dt * 2.2);
    const fx = Math.cos(st.camH), fz = Math.sin(st.camH);
    camPos.set(rider.position.x - fx * 3.9, rider.position.y + 1.75, rider.position.z - fz * 3.9);
    const ground = terrain.height(camPos.x, camPos.z);
    camPos.y = Math.max(camPos.y, ground + 1.2);
    if (!st.ready || camera.position.distanceTo(camPos) > 25) { camera.position.copy(camPos); st.camH = r.h; }
    else camera.position.lerp(camPos, Math.min(1, dt * 6));
    look.set(rider.position.x + fx * 7, rider.position.y + 0.95 + grade * 7, rider.position.z + fz * 7);
    camera.lookAt(look);
    light.position.copy(rider.position).addScaledVector(sunDir, 40);
    light.target.position.copy(rider.position);
    scene.userData.sky.position.copy(camera.position);

    const pending = updateChunks(camera.position.x, camera.position.z, st.ready ? 6 : 400);
    if (!st.ready && pending === 0) { st.ready = true; q('.wload').hidden = true; }
    if (st.ready || pending < 3) renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    el, update, three: true,
    destroy() {
      gone = true;
      cancelAnimationFrame(raf);
      document.body.classList.remove('worldfull');
      renderer.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); });
      el.remove();
    },
  };
}
