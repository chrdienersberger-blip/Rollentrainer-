import { extractSide, coreVisibility, frameAngles, analyzeSession } from './analysis.js';
import { evaluate, STYLES } from './evaluate.js';
import { syntheticSession } from './demo.js';

const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const COUNTDOWN_S = 10;
const HISTORY_KEY = 'rollentrainer.history.v1';

const $ = (id) => document.getElementById(id);
const video = $('video'), canvas = $('canvas'), ctx = canvas.getContext('2d');

const state = {
  facing: 'user', stream: null, fileUrl: null, mode: null, // 'camera' | 'file'
  phase: 'idle', phaseEnd: 0, recStart: 0,
  samples: [], votes: { left: 0, right: 0 },
  snapshot: null, snapshotKnee: 0, raf: 0, lastVideoTime: -1, wakeLock: null,
};
let landmarker = null, landmarkerPromise = null;

// ---------- Hilfen ----------
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
  const h = Number($('height').value);
  return {
    style: $('style').value,
    heightCm: h >= 130 && h <= 220 ? h : 175,
    duration: Number($('duration').value),
  };
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

// ---------- Zeichnen ----------
function drawSkeleton(p, angles) {
  const u = Math.max(2, canvas.width / 320);
  const line = (pts, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = u * 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
  };
  line([p.wrist, p.elbow, p.shoulder, p.hip], '#35c2ff');
  line([p.hip, p.knee, p.ankle], '#3ddc84');
  line([p.heel, p.ankle, p.toe, p.heel], '#ffc247');
  ctx.fillStyle = '#fff';
  for (const q of [p.wrist, p.elbow, p.shoulder, p.hip, p.knee, p.ankle]) {
    ctx.beginPath(); ctx.arc(q.x, q.y, u * 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = `700 ${u * 9}px system-ui, sans-serif`;
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
  const { duration } = settings();
  if (state.phase === 'record') {
    const total = state.mode === 'file' ? (video.duration || 1) * 1000 : duration * 1000;
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
      state.snapshot = canvas.toDataURL('image/jpeg', 0.75);
    }
  }
}

// ---------- Ergebnis ----------
function finish() {
  if (state.phase !== 'record') return;
  const samples = state.samples, snapshot = state.snapshot, wasCamera = state.mode === 'camera';
  stopMedia();
  if (wasCamera) say('Messung beendet.');
  showResults(analyzeSession(samples, settings()), snapshot, true);
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) ?? []; } catch { return []; }
}
function saveHistory(entry) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...loadHistory()].slice(0, 10))); } catch { /* optional */ }
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const de = (v) => String(v).replace('.', ',');
const STATUS_TEXT = { ok: 'Passt', warn: 'Leicht daneben', bad: 'Anpassen' };

function showResults(result, snapshot, save) {
  show('results');
  const items = $('items'), warnings = $('warnings');
  items.replaceChildren();
  warnings.replaceChildren();
  $('snapshotFig').hidden = !snapshot;
  if (snapshot) $('snapshot').src = snapshot;

  if (!result.ok) {
    $('summary').textContent = 'Die Messung konnte nicht ausgewertet werden.';
    warnings.append(el('p', 'error', result.reason));
    return;
  }
  const { style } = settings();
  const list = evaluate(result, style);
  const previous = loadHistory()[0]?.metrics;
  const open = list.filter((i) => i.status !== 'ok').length;
  $('summary').textContent =
    `${result.cycles} Kurbelumdrehungen bei ${result.cadence} U/min ausgewertet (Fahrstil: ${STYLES[style].label}). ` +
    (open ? `${open} von ${list.length} Werten liegen außerhalb des Zielbereichs.` : 'Alle Werte liegen im Zielbereich.');
  for (const w of result.warnings) warnings.append(el('p', 'error', w));

  let group = null;
  for (const it of list) {
    if (it.group !== group) { group = it.group; items.append(el('div', 'group', group)); }
    const card = el('section', `card item ${it.status}`);
    const head = el('div', 'head');
    head.append(el('span', 'label', it.label), el('span', 'value', `${de(it.value)}${it.unit}`));
    const meta = el('div', 'meta');
    meta.append(el('span', 'badge', STATUS_TEXT[it.status]), `Zielbereich ${it.range}`);
    const prev = previous?.[it.key];
    if (save && prev != null) meta.append(` · letzte Messung ${de(prev)}${it.unit}`);
    card.append(head, meta, el('p', 'tip', it.tip));
    items.append(card);
  }
  if (save) saveHistory({ date: Date.now(), style, cadence: result.cadence, metrics: result.metrics });
}

function renderHistory() {
  const hist = loadHistory();
  $('history').hidden = !hist.length;
  $('historyList').replaceChildren(...hist.map((h) => {
    const row = el('div', 'hist');
    const d = new Date(h.date).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    const left = el('span', null, d);
    left.append(document.createElement('br'), el('small', null, STYLES[h.style]?.label ?? ''));
    row.append(left, el('span', null, `Knie ${de(h.metrics.kneeExt)}° · Oberkörper ${de(h.metrics.torso)}°`));
    return row;
  }));
}

// ---------- Bedienung ----------
$('startBtn').onclick = () => start('camera');
$('fileInput').onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) start('file', file);
};
$('demoBtn').onclick = () => {
  showResults(analyzeSession(syntheticSession({ saddleHeight: 72, torsoDeg: 44 }), settings()), null, false);
  $('summary').textContent = 'Beispiel mit künstlichen Daten: ' + $('summary').textContent;
};
$('cancelBtn').onclick = () => { stopMedia(); renderHistory(); show('setup'); };
$('againBtn').onclick = () => { renderHistory(); show('setup'); };
$('switchBtn').onclick = async () => {
  state.facing = state.facing === 'user' ? 'environment' : 'user';
  try { await openCamera(); beginCountdown(); } catch (err) { console.error(err); }
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase !== 'idle') { stopMedia(); renderHistory(); show('setup'); }
});

renderHistory();
