import { extractSide, coreVisibility, frameAngles, analyzeSession } from './analysis.js';
import { evaluate, stability, saddleFromInseam, STYLES } from './evaluate.js';
import { BRANDS, CATEGORIES, findBike } from './bikes.js';
import { syntheticSession } from './demo.js';
import { initHero } from './hero.js';
import { ownPhoto, saveOwnPhoto, removeOwnPhoto, commonsPhotos } from './photos.js';

const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const COUNTDOWN_S = 10;
const HISTORY_KEY = 'rollentrainer.history.v1';
const SETTINGS_KEY = 'rollentrainer.settings.v1';
const PICK_KEY = 'rollentrainer.photopick.v1';
const SVGNS = 'http://www.w3.org/2000/svg';

const $ = (id) => document.getElementById(id);
const video = $('video'), canvas = $('canvas'), ctx = canvas.getContext('2d');

const state = {
  facing: 'user', stream: null, fileUrl: null, mode: null, // 'camera' | 'file'
  phase: 'idle', phaseEnd: 0, recStart: 0,
  samples: [], votes: { left: 0, right: 0 },
  snapshot: null, snapshotKnee: 0, raf: 0, lastVideoTime: -1, wakeLock: null,
};
const prefs = { bike: 'other|allround', style: 'sport', height: 175, inseam: '', duration: 45 };
let landmarker = null, landmarkerPromise = null;

// ---------- Hilfen ----------
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
const de = (v, digits = 1) => Number(v).toLocaleString('de-DE', { maximumFractionDigits: digits });
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional */ } },
};

function show(view) {
  for (const id of ['setup', 'live', 'results']) $(id).hidden = id !== view;
  window.scrollTo(0, 0);
}
function banner(text, cls = '') {
  $('banner').textContent = text;
  $('banner').className = 'banner ' + cls;
  $('banner').hidden = !text;
}
function say(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* Sprachausgabe ist optional */ }
}
function settings() {
  const h = Number(prefs.height);
  return {
    style: prefs.style,
    bike: findBike(prefs.bike),
    heightCm: h >= 130 && h <= 220 ? h : 175,
    inseamCm: Number(prefs.inseam) || 0,
    duration: prefs.duration,
  };
}

// ---------- Einrichtung ----------
function segment(container, options, current, onPick) {
  container.replaceChildren(...options.map(({ value, label, sub }) => {
    const btn = el('button', null, label);
    btn.type = 'button';
    if (sub) btn.append(el('small', null, sub));
    btn.setAttribute('aria-pressed', String(value === current()));
    btn.onclick = () => {
      onPick(value);
      for (const b of container.children) b.setAttribute('aria-pressed', String(b === btn));
    };
    return btn;
  }));
}

function renderBikeInfo() {
  const bike = findBike(prefs.bike);
  const cat = CATEGORIES[bike.cat];
  const chips = [el('span', 'chip hl', cat.label)];
  if (bike.integrated) chips.push(el('span', 'chip', 'Integriertes Cockpit'));
  $('bikeChips').replaceChildren(...chips);
  const cap = $('heroCaption');
  cap.replaceChildren(el('b', null, bike.generic ? cat.label : bike.name));
  if (!bike.generic) cap.append(` · ${cat.label}`);
  $('styleHint').textContent = prefs.style === cat.style
    ? `Passend zum ${bike.generic ? 'Radtyp' : bike.name} vorgeschlagen. Du kannst ein anderes Ziel wählen.`
    : `Für ${bike.generic ? 'diesen Radtyp' : 'das ' + bike.name} wäre „${STYLES[cat.style].label}“ typisch – deine Wahl gilt.`;
}

function renderStyleSeg() {
  segment($('styleSeg'),
    Object.entries(STYLES).map(([value, s]) => ({ value, label: s.label, sub: s.sub })),
    () => prefs.style,
    (v) => { prefs.style = v; store.set(SETTINGS_KEY, prefs); renderBikeInfo(); });
}

function initSetup() {
  Object.assign(prefs, store.get(SETTINGS_KEY, {}));
  if (!STYLES[prefs.style]) prefs.style = 'sport';

  const sel = $('bike');
  const general = el('optgroup');
  general.label = 'Ohne Modellangabe';
  for (const [key, c] of Object.entries(CATEGORIES)) {
    const o = el('option', null, c.label);
    o.value = `other|${key}`;
    general.append(o);
  }
  sel.append(general);
  for (const [brand, list] of Object.entries(BRANDS)) {
    const g = el('optgroup');
    g.label = brand;
    for (const x of list) {
      const o = el('option', null, `${brand} ${x.model}`);
      o.value = `${brand}|${x.model}`;
      g.append(o);
    }
    sel.append(g);
  }
  sel.value = prefs.bike;
  if (!sel.value) sel.value = prefs.bike = 'other|allround';
  sel.onchange = () => {
    prefs.bike = sel.value;
    prefs.style = CATEGORIES[findBike(prefs.bike).cat].style; // Vorschlag passend zum Rad
    store.set(SETTINGS_KEY, prefs);
    renderStyleSeg();
    renderBikeInfo();
    updatePhoto();
  };

  renderStyleSeg();
  segment($('durSeg'), [30, 45, 60].map((v) => ({ value: v, label: `${v} s` })),
    () => prefs.duration, (v) => { prefs.duration = v; store.set(SETTINGS_KEY, prefs); });
  for (const id of ['height', 'inseam']) {
    $(id).value = prefs[id];
    $(id).oninput = () => { prefs[id] = $(id).value; store.set(SETTINGS_KEY, prefs); };
  }
  renderBikeInfo();
}

// ---------- Pose-Modell ----------
function loadLandmarker() {
  landmarkerPromise ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import(`${MP_BASE}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
    const make = (delegate) => PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO', numPoses: 1,
    });
    try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); }
    return landmarker;
  })();
  landmarkerPromise.catch(() => { landmarkerPromise = null; });
  return landmarkerPromise;
}

// ---------- Kamera / Video ----------
function stopMedia() {
  cancelAnimationFrame(state.raf);
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  video.pause();
  video.srcObject = null;
  video.onended = null;
  if (state.fileUrl) { URL.revokeObjectURL(state.fileUrl); state.fileUrl = null; }
  video.removeAttribute('src');
  state.wakeLock?.release().catch(() => {});
  state.wakeLock = null;
  state.phase = 'idle';
}

async function openCamera() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = state.stream;
  await video.play();
}

function resetRecording() {
  state.samples = [];
  state.votes = { left: 0, right: 0 };
  state.snapshot = null;
  state.snapshotKnee = 0;
  state.lastVideoTime = -1;
  $('progressBar').style.width = '0';
}

function beginCountdown() {
  resetRecording();
  state.phase = 'countdown';
  state.phaseEnd = performance.now() + COUNTDOWN_S * 1000;
  say(`Messung startet in ${COUNTDOWN_S} Sekunden. Locker und gleichmäßig treten.`);
}

async function start(mode, file) {
  $('setupError').hidden = true;
  state.mode = mode;
  show('live');
  $('switchBtn').hidden = mode !== 'camera';
  banner('Modell wird geladen …');
  try {
    if (mode === 'camera') {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocamera');
      await openCamera();
    }
    await loadLandmarker();
    if (mode === 'file') {
      state.fileUrl = URL.createObjectURL(file);
      video.src = state.fileUrl;
      video.onended = finish;
      resetRecording();
      await video.play();
      state.phase = 'record';
      state.recStart = performance.now();
    } else {
      state.wakeLock = await navigator.wakeLock?.request('screen').catch(() => null);
      beginCountdown();
    }
    loop();
  } catch (err) {
    console.error(err);
    stopMedia();
    show('setup');
    const msg = err?.name === 'NotAllowedError' ? 'Der Kamerazugriff wurde nicht erlaubt. Bitte in den Browser-Einstellungen freigeben und erneut versuchen.'
      : err?.name === 'NotFoundError' || err?.message === 'nocamera' ? 'Es wurde keine Kamera gefunden. Die Seite muss über https geöffnet sein.'
      : mode === 'file' && err?.name === 'NotSupportedError' ? 'Dieses Videoformat kann der Browser nicht abspielen.'
      : 'Die Bewegungserkennung konnte nicht geladen werden. Bitte Internetverbindung prüfen und erneut versuchen.';
    $('setupError').textContent = msg;
    $('setupError').hidden = false;
  }
}

// ---------- Zeichnen im Kamerabild ----------
function drawSkeleton(p, angles) {
  const u = Math.max(2, canvas.width / 320);
  const line = (pts, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = u * 1.1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
  };
  line([p.wrist, p.elbow, p.shoulder, p.hip], '#ffffff');
  line([p.hip, p.knee, p.ankle], '#ffffff');
  line([p.heel, p.ankle, p.toe, p.heel], '#ffffff');
  ctx.fillStyle = '#fff';
  for (const q of [p.wrist, p.elbow, p.shoulder, p.hip, p.knee, p.ankle]) {
    ctx.beginPath(); ctx.arc(q.x, q.y, u * 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = `500 ${u * 9}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.lineWidth = u; ctx.strokeStyle = '#000';
  const label = `${Math.round(angles.knee)}°`;
  ctx.strokeText(label, p.knee.x + u * 5, p.knee.y);
  ctx.fillText(label, p.knee.x + u * 5, p.knee.y);
}

// ---------- Hauptschleife ----------
function loop() {
  state.raf = requestAnimationFrame(loop);
  if (video.readyState < 2 || !video.videoWidth) return;
  const now = performance.now();

  if (state.phase === 'countdown') {
    const left = Math.ceil((state.phaseEnd - now) / 1000);
    if (left <= 0) {
      state.phase = 'record';
      state.recStart = now;
      state.samples = [];
      say('Los');
    } else {
      banner(String(left), 'big');
    }
  }
  if (state.phase === 'record') {
    const total = state.mode === 'file' ? (video.duration || 1) * 1000 : prefs.duration * 1000;
    const elapsed = state.mode === 'file' ? video.currentTime * 1000 : now - state.recStart;
    $('progressBar').style.width = `${Math.min(100, (elapsed / total) * 100)}%`;
    $('hudTime').textContent = `${Math.max(0, Math.ceil((total - elapsed) / 1000))} s`;
    banner(state.mode === 'file' ? 'Video wird ausgewertet …' : '● Messung läuft – gleichmäßig treten', 'rec');
    if (state.mode === 'camera' && elapsed >= total) return finish();
  } else {
    $('hudTime').textContent = '–';
  }

  if (video.currentTime === state.lastVideoTime) return;
  state.lastVideoTime = video.currentTime;
  const w = video.videoWidth, h = video.videoHeight;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.drawImage(video, 0, 0, w, h);

  const lms = landmarker.detectForVideo(video, now).landmarks?.[0];
  if (!lms) {
    $('hudKnee').textContent = $('hudTorso').textContent = '–';
    if (state.phase !== 'countdown') banner('Keine Person erkannt – bist du ganz im Bild?');
    return;
  }
  const left = extractSide(lms, 'left', w, h), right = extractSide(lms, 'right', w, h);
  state.votes.left += coreVisibility(left);
  state.votes.right += coreVisibility(right);
  const p = state.votes.left >= state.votes.right ? left : right;
  const angles = frameAngles(p);
  const visible = coreVisibility(p) >= 0.5;
  if (visible) {
    drawSkeleton(p, angles);
    $('hudKnee').textContent = `${Math.round(angles.knee)}°`;
    $('hudTorso').textContent = `${Math.round(angles.torso)}°`;
  }

  if (state.phase === 'record') {
    state.samples.push({ t: now, left, right, span: Math.abs(left.shoulder.x - right.shoulder.x) });
    // Standbild im Moment der größten Kniestreckung merken
    if (visible && coreVisibility(p) >= 0.7 && angles.knee < 172 && angles.knee > state.snapshotKnee + 0.5) {
      state.snapshotKnee = angles.knee;
      state.snapshot = smallSnapshot();
    }
  }
}

/** Standbild verkleinert, damit es mit der Messung gespeichert werden kann. */
function smallSnapshot() {
  const c = document.createElement('canvas');
  const scale = Math.min(1, 800 / canvas.width);
  c.width = Math.round(canvas.width * scale);
  c.height = Math.round(canvas.height * scale);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}

function finish() {
  if (state.phase !== 'record') return;
  const samples = state.samples, snapshot = state.snapshot, wasCamera = state.mode === 'camera';
  stopMedia();
  if (wasCamera) say('Messung beendet.');
  const record = buildRecord(analyzeSession(samples, settings()), snapshot);
  const previous = loadHistory()[0] ?? null;
  if (record.result.ok) saveHistory([record, ...loadHistory()].slice(0, 12));
  showRecord(record, { previous });
}

// ---------- Ergebnis ----------
const STATUS_TEXT = { ok: 'Im Zielbereich', warn: 'Leicht daneben', bad: 'Anpassen' };
const badge = (status) => {
  const b = el('span', `badge ${status}`);
  b.append(el('span', null, STATUS_TEXT[status]));
  return b;
};

function scoreCard(ev, result) {
  const card = el('section', 'card scorecard');
  const ring = el('div', 'ring');
  const svg = svgEl('svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true' }, ring);
  const C = 2 * Math.PI * 52;
  svgEl('circle', { cx: 60, cy: 60, r: 52, fill: 'none', stroke: '#d6d1c6', 'stroke-width': 1.5 }, svg);
  svgEl('circle', {
    cx: 60, cy: 60, r: 52, fill: 'none', stroke: '#111110', 'stroke-width': 3.5, 'stroke-linecap': 'butt',
    'stroke-dasharray': `${(C * ev.score) / 100} ${C}`,
  }, svg);
  const num = el('div', 'num');
  num.append(el('b', null, String(ev.score)), el('small', null, 'von 100'));
  ring.append(num);
  const txt = el('div');
  const open = ev.items.filter((i) => i.status !== 'ok').length;
  txt.append(el('h1', null, ev.verdict), el('p', null,
    open ? `${open} von ${ev.items.length} Werten liegen außerhalb des Zielbereichs für „${STYLES[ev.style].label}“.`
      : `Alle ${ev.items.length} Werte liegen im Zielbereich für „${STYLES[ev.style].label}“.`));
  card.append(ring, txt);
  return card;
}

function statTiles(result, stab) {
  const wrap = el('div', 'stats');
  const tile = (value, label) => {
    const t = el('div', 'stat');
    t.append(el('b', null, value), el('small', null, label));
    return t;
  };
  wrap.append(
    tile(String(result.cadence ?? '–'), 'U/min Trittfrequenz'),
    tile(String(result.cycles ?? '–'), 'Umdrehungen gemessen'),
    tile(stab ? `${de(stab.value)} cm` : '–', 'Hüftbewegung'));
  return wrap;
}

function kneeChart(curve) {
  const card = el('section', 'card');
  card.append(el('h2', null, 'Kniewinkel über eine Kurbelumdrehung'),
    el('p', 'chartsub', 'Mittel aller gemessenen Umdrehungen. Das grüne Band zeigt, wo der höchste Punkt der Kurve liegen sollte.'));
  const wrap = el('div', 'chartwrap');
  const W = 340, H = 180, L = 30, R = 10, T = 14, B = 24;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Liniendiagramm des Kniewinkels über eine Kurbelumdrehung' }, wrap);
  const n = curve.length, pts = [...curve, curve[0]];
  const yMin = Math.min(60, Math.floor(Math.min(...curve) / 10) * 10 - 10);
  const yMax = Math.max(160, Math.ceil(Math.max(...curve) / 10) * 10 + 10);
  const x = (i) => L + (i / n) * (W - L - R);
  const y = (v) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const text = (s, tx, ty, anchor = 'middle') => {
    const t = svgEl('text', { x: tx, y: ty, 'text-anchor': anchor, fill: '#77736b', 'font-size': 8.5, 'font-family': 'Helvetica Neue, Helvetica, Arial, sans-serif' }, svg);
    t.textContent = s;
    return t;
  };
  for (let v = Math.ceil(yMin / 30) * 30; v <= yMax; v += 30) {
    svgEl('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: '#d6d1c6', 'stroke-width': 1 }, svg);
    text(`${v}°`, L - 5, y(v) + 3, 'end');
  }
  svgEl('rect', { x: L, y: y(150), width: W - L - R, height: y(140) - y(150), fill: '#3f6b4f', opacity: 0.22 }, svg);
  text('Ziel 140–150°', W - R - 4, y(150) - 4, 'end');
  [['Kurbel oben', 0, 'start'], ['unten', n / 2, 'middle'], ['oben', n, 'end']].forEach(([s, i, a]) => text(s, x(i), H - 6, a));
  svgEl('polyline', {
    points: pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
    fill: 'none', stroke: '#111110', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }, svg);
  const iMax = curve.indexOf(Math.max(...curve));
  svgEl('circle', { cx: x(iMax), cy: y(curve[iMax]), r: 4, fill: '#111110', stroke: '#f3f1ec', 'stroke-width': 2 }, svg);
  const peak = text(`${de(curve[iMax])}°`, x(iMax), y(curve[iMax]) - 9);
  peak.setAttribute('fill', '#111110'); peak.setAttribute('font-weight', 700);

  // Fadenkreuz + Tooltip
  const cross = svgEl('line', { y1: T, y2: H - B, stroke: '#77736b', 'stroke-width': 1, visibility: 'hidden' }, svg);
  const dot = svgEl('circle', { r: 4, fill: '#a8553a', stroke: '#f3f1ec', 'stroke-width': 2, visibility: 'hidden' }, svg);
  const tip = el('div', 'tooltip');
  tip.hidden = true;
  wrap.append(tip);
  const move = (e) => {
    const box = svg.getBoundingClientRect();
    const fx = ((e.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(n, Math.round(((fx - L) / (W - L - R)) * n)));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(pts[i]));
    cross.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.replaceChildren(el('b', null, `${de(pts[i])}°`), ` bei ${Math.round((i / n) * 360)}° Kurbelstellung`);
    tip.style.left = `${Math.max(18, Math.min(82, (x(i) / W) * 100))}%`;
  };
  const leave = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', leave);
  card.append(wrap);
  return card;
}

function rangeBar(it) {
  const hiEnd = it.hi ?? it.lo + 4 * it.tol;
  const min = it.lo - 3 * it.tol, max = hiEnd + (it.hi == null ? 0 : 3 * it.tol);
  const pct = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const bar = el('div', 'bar');
  const zone = el('div', 'zone');
  zone.style.left = `${pct(it.lo)}%`;
  zone.style.width = `${pct(hiEnd) - pct(it.lo)}%`;
  const mark = el('div', 'mark');
  mark.style.left = `${Math.max(1, Math.min(99, pct(it.value)))}%`;
  bar.append(el('div', 'track'), zone, mark);
  const tick = (v, prefix = '') => {
    const t = el('span', 'tick', `${prefix}${de(v)}${it.unit.trim() === '°' ? '°' : ''}`);
    t.style.left = `${pct(v)}%`;
    bar.append(t);
  };
  tick(it.lo, it.hi == null ? 'ab ' : '');
  if (it.hi != null) tick(it.hi);
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `Wert ${de(it.value)}, Zielbereich ${it.hi == null ? 'ab ' + de(it.lo) : de(it.lo) + ' bis ' + de(it.hi)}`);
  return bar;
}

function itemCard(it, previous) {
  const card = el('section', 'card item');
  const head = el('div', 'head');
  const left = el('div');
  left.append(el('div', 'label', it.label), el('div', 'sub', it.sub), badge(it.status));
  const sign = it.signed && it.value > 0 ? '+' : '';
  head.append(left, el('div', 'value', `${sign}${de(it.value)}${it.unit}`));
  card.append(head, rangeBar(it), el('p', 'tip', it.tip));
  if (previous != null && previous !== it.value) {
    const diff = Math.round((it.value - previous) * 10) / 10;
    card.append(el('div', 'prev', `Letzte Messung: ${de(previous)}${it.unit} (${diff > 0 ? '+' : ''}${de(diff)})`));
  }
  return card;
}

function infoCard(icon, title, text) {
  const card = el('section', 'card info');
  const body = el('div');
  body.append(el('b', null, title), el('p', null, text));
  card.append(el('div', 'ico', icon), body);
  return card;
}

// ---------- Gespeicherte Messungen ----------
const loadHistory = () => store.get(HISTORY_KEY, []);
function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // Speicher voll: Standbilder der älteren Messungen weglassen
    store.set(HISTORY_KEY, list.map((r, i) => (i ? { ...r, snapshot: null } : r)));
  }
}

/** Alles, was nötig ist, um eine Auswertung später wieder genauso anzuzeigen. */
function buildRecord(result, snapshot = null) {
  const cfg = settings();
  const score = result.ok ? evaluate(result, cfg.style, cfg.bike).score : null;
  return {
    date: Date.now(), bikeKey: prefs.bike, bike: cfg.bike.name, style: cfg.style,
    inseamCm: cfg.inseamCm, score, cadence: result.cadence, metrics: result.metrics, result, snapshot,
  };
}

function bikeOfRecord(rec) {
  if (rec.bikeKey) return findBike(rec.bikeKey);
  for (const [brand, list] of Object.entries(BRANDS)) {
    const hit = list.find((x) => `${brand} ${x.model}` === rec.bike);
    if (hit) return findBike(`${brand}|${hit.model}`);
  }
  const cat = Object.keys(CATEGORIES).find((k) => CATEGORIES[k].label === rec.bike);
  return findBike(`other|${cat ?? 'allround'}`);
}

/** Zeigt eine Messung an – frisch gemessen oder aus dem Verlauf geöffnet. */
function showRecord(rec, { previous = null, demo = false, stored = false } = {}) {
  show('results');
  const body = $('resBody');
  body.replaceChildren();
  const bike = bikeOfRecord(rec);
  // Ältere Einträge enthalten nur die Messwerte
  const result = rec.result ?? { ok: true, metrics: rec.metrics, cadence: rec.cadence, cycles: null, warnings: [], geometry: null, kneeCurve: null, extras: null };
  const when = new Date(rec.date).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  $('resMeta').textContent = demo ? 'Beispiel mit künstlichen Daten' : stored ? `${bike.name} · ${when}` : bike.name;

  if (!result.ok) {
    const card = el('section', 'card');
    card.append(el('h2', null, 'Die Messung konnte nicht ausgewertet werden'), el('p', 'hint', result.reason));
    body.append(card);
    return;
  }
  const ev = evaluate(result, rec.style, bike);
  const stab = result.extras ? stability(result.extras) : null;

  body.append(scoreCard(ev, result), statTiles(result, stab));
  if (ev.top) {
    const top = el('section', 'card topcard');
    top.append(el('div', 'eyebrow', 'Wichtigste Anpassung'), el('h2', null, ev.top.action), el('p', null, ev.top.tip));
    body.append(top);
  }
  for (const w of result.warnings ?? []) body.append(el('p', 'alert', w));
  if (rec.snapshot) {
    const fig = el('figure');
    const img = el('img');
    img.src = rec.snapshot;
    img.alt = 'Moment der größten Kniestreckung mit eingezeichneten Gelenken';
    fig.append(img, el('figcaption', null, 'Moment der größten Kniestreckung'));
    body.append(fig);
  }
  if (result.kneeCurve) body.append(kneeChart(result.kneeCurve));

  let group = null;
  for (const it of ev.items) {
    if (it.group !== group) { group = it.group; body.append(el('div', 'group', group)); }
    body.append(itemCard(it, previous?.metrics?.[it.key]));
  }

  const extra = [];
  if (stab) {
    extra.push(infoCard('↕', `Ruhe im Sattel: ${{ ok: 'ruhig', warn: 'leicht unruhig', bad: 'unruhig' }[stab.status]}`, `${stab.tip} Gemessene Auf-/Abbewegung der Hüfte: ${de(stab.value)} cm je Umdrehung.`));
  }
  const sh = saddleFromInseam(rec.inseamCm);
  if (sh) {
    extra.push(infoCard('⌖', `Richtwert Sattelhöhe: ${de(sh)} cm`, `Aus deiner Schrittlänge (${de(rec.inseamCm)} cm × 0,883), gemessen von der Tretlagermitte bis zur Satteloberkante entlang des Sitzrohrs. Als Startwert zum Gegenprüfen mit dem Maßband.`));
  }
  if (bike.integrated) {
    extra.push(infoCard('⚙', `Cockpit am ${bike.name}`, 'Bei integrierten Lenker-Vorbau-Einheiten sind Länge und Höhe je nach Ausstattung nur über herstellerspezifische Teile änderbar. Vor einem Umbau die Angaben des Herstellers prüfen.'));
  }
  if (!rec.result) {
    extra.push(infoCard('i', 'Ältere Messung', 'Diese Messung stammt aus einer früheren Version der App. Gespeichert sind nur die Messwerte – Standbild und Kniewinkel-Kurve gibt es erst für neue Messungen.'));
  }
  if (extra.length) body.append(el('div', 'group', 'Weitere Hinweise'), ...extra);

  if (stored) {
    const del = el('button', 'textbtn', 'Diese Messung löschen');
    del.onclick = () => {
      if (!confirm('Diese Messung endgültig löschen?')) return;
      saveHistory(loadHistory().filter((r) => r.date !== rec.date));
      renderHistory();
      show('setup');
    };
    body.append(del);
  }
}

function renderHistory() {
  const hist = loadHistory();
  $('history').hidden = !hist.length;
  $('historyList').replaceChildren(...hist.map((h, i) => {
    const row = el('button', 'hist');
    row.type = 'button';
    const d = new Date(h.date).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    const mid = el('div', null, h.bike ?? 'Messung');
    mid.append(el('small', null, `${d} · ${STYLES[h.style]?.label ?? ''}`));
    row.append(el('div', 'sc', h.score != null ? String(h.score) : '–'), mid,
      el('div', 'r', `Knie ${de(h.metrics.kneeExt)}°`), el('div', 'go', '→'));
    row.setAttribute('aria-label', `Messung vom ${d} öffnen`);
    row.onclick = () => showRecord(h, { previous: hist[i + 1] ?? null, stored: true });
    return row;
  }));
}

// ---------- Foto des Rads ----------
let photoReq = 0, photoList = [];
function showPhoto(photo) {
  $('heroPhoto').hidden = !photo;
  $('heroSvg').style.display = photo ? 'none' : '';
  if (!photo) return;
  $('heroImg').src = photo.src;
  $('heroImg').alt = `Foto: ${findBike(prefs.bike).name}`;
  const credit = $('heroCredit');
  credit.replaceChildren();
  if (photo.page) {
    const a = el('a', null, `Foto: ${photo.credit}`);
    a.href = photo.page; a.target = '_blank'; a.rel = 'noopener';
    credit.append(a);
  } else {
    credit.textContent = photo.credit;
  }
}
async function updatePhoto() {
  const key = prefs.bike, bike = findBike(key), req = ++photoReq;
  const own = ownPhoto(key);
  photoList = [];
  $('removePhotoBtn').hidden = !own;
  $('nextPhotoBtn').hidden = true;
  $('ownPhotoLabel').firstChild.textContent = own ? 'Foto ersetzen' : 'Eigenes Foto';
  if (own) return showPhoto({ src: own, credit: 'Dein eigenes Foto' });
  showPhoto(null);
  if (bike.generic) return;
  try { photoList = await commonsPhotos(bike); } catch { photoList = []; }
  if (req !== photoReq || !photoList.length) return;
  const pick = (store.get(PICK_KEY, {})[key] ?? 0) % photoList.length;
  $('nextPhotoBtn').hidden = photoList.length < 2;
  showPhoto(photoList[pick]);
}
$('heroImg').onerror = () => showPhoto(null);
$('nextPhotoBtn').onclick = () => {
  const picks = store.get(PICK_KEY, {});
  picks[prefs.bike] = ((picks[prefs.bike] ?? 0) + 1) % photoList.length;
  store.set(PICK_KEY, picks);
  showPhoto(photoList[picks[prefs.bike]]);
};
$('ownPhotoInput').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    if (!(await saveOwnPhoto(prefs.bike, file))) alert('Das Foto konnte nicht gespeichert werden – der Speicher des Browsers ist voll.');
  } catch { alert('Dieses Bild kann nicht gelesen werden.'); }
  updatePhoto();
};
$('removePhotoBtn').onclick = () => { removeOwnPhoto(prefs.bike); updatePhoto(); };

// ---------- Bedienung ----------
$('startBtn').onclick = () => start('camera');
$('fileInput').onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) start('file', file);
};
$('demoBtn').onclick = () =>
  showRecord(buildRecord(analyzeSession(syntheticSession({ saddleHeight: 72, torsoDeg: 44 }), settings())), { demo: true });
$('cancelBtn').onclick = () => { stopMedia(); renderHistory(); show('setup'); };
$('againBtn').onclick = () => { renderHistory(); show('setup'); };
$('switchBtn').onclick = async () => {
  state.facing = state.facing === 'user' ? 'environment' : 'user';
  try { await openCamera(); beginCountdown(); } catch (err) { console.error(err); }
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase !== 'idle') { stopMedia(); renderHistory(); show('setup'); }
});

initSetup();
initHero($('heroSvg'),
  () => ({ style: prefs.style, bike: findBike(prefs.bike) }),
  () => !$('setup').hidden && !document.hidden && $('heroPhoto').hidden);
renderHistory();
updatePhoto();
