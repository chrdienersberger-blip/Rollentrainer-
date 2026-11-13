import { extractSide, coreVisibility, frameAngles, analyzeSession, pickSide } from './analysis.js?v=12';
import { evaluate, stability, saddleFromInseam, statusOf, rangeOf, STYLES } from './evaluate.js?v=12';
import { BRANDS, CATEGORIES, findBike } from './bikes.js?v=12';
import { syntheticSession } from './demo.js?v=12';
import { putClip, getClip, pruneClips } from './clips.js?v=12';
import { REGIONS, clipStatuses, share, frameAt, drawOutline, drawSkeleton as drawJoints } from './overlay.js?v=12';
import { initHero } from './hero.js?v=12';

const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const COUNTDOWN_S = 10;
const HISTORY_KEY = 'rollentrainer.history.v1';
const SETTINGS_KEY = 'rollentrainer.settings.v1';
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
  document.body.classList.toggle('busy', view === 'live');
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
  state.clip = null;
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
      state.file = file;
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
      state.clip = startClip();
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
    state.samples.push({ t: now, vt: state.mode === 'file' ? video.currentTime * 1000 : null, left, right, span: Math.abs(left.shoulder.x - right.shoulder.x) });
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

// ---------- Videoaufnahme der Messung ----------
/** Startet die Aufzeichnung des Kamerabilds. Liefert null, wenn der Browser das nicht kann. */
function startClip() {
  if (state.mode !== 'camera' || !window.MediaRecorder || !state.stream) return null;
  const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  try {
    const rec = new MediaRecorder(state.stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 1_500_000 });
    const clip = { rec, chunks: [], t0: performance.now() };
    rec.onstart = () => { clip.t0 = performance.now(); };
    rec.ondataavailable = (e) => { if (e.data.size) clip.chunks.push(e.data); };
    clip.done = new Promise((resolve) => {
      rec.onstop = () => resolve(clip.chunks.length ? new Blob(clip.chunks, { type: rec.mimeType }) : null);
      rec.onerror = () => resolve(null);
    });
    rec.start();
    return clip;
  } catch { return null; }
}
const stopClip = (clip) => { try { if (clip && clip.rec.state !== 'inactive') clip.rec.stop(); } catch { /* schon beendet */ } };

/** Gelenkpunkte der Messung, passend zur Zeitachse des Videos. */
function clipFrames(samples, side, t0) {
  return samples.map((s) => ({
    t: Math.round(s.vt ?? s.t - t0),
    c: coreVisibility(s[side]) >= 0.5 ? 1 : 0,
    a: Math.min(s[side].elbow.v, s[side].wrist.v) >= 0.5 ? 1 : 0,
    p: Object.fromEntries(Object.entries(s[side]).map(([k, v]) => [k, [Math.round(v.x), Math.round(v.y)]])),
  })).filter((f) => f.t >= 0);
}

async function finish() {
  if (state.phase !== 'record') return;
  state.phase = 'finishing';
  const mode = state.mode, samples = state.samples, snapshot = state.snapshot, clip = state.clip, file = state.file;
  const w = canvas.width, h = canvas.height;
  banner('Auswertung …');
  const record = buildRecord(analyzeSession(samples, settings()), snapshot);
  const result = record.result;
  record.clips = [];

  // Aufnahme sauber abschließen, bevor die Kamera gestoppt wird. Nie länger als ein paar Sekunden warten.
  const within = (promise, ms) => Promise.race([promise, new Promise((r) => setTimeout(() => r(null), ms))]);
  stopClip(clip);
  const blob = mode === 'file' ? file : clip ? await within(clip.done, 4000) : null;
  stopMedia();
  if (mode === 'camera') say('Messung beendet.');

  let liveClip = null;
  if (result.ok && blob) {
    const frames = clipFrames(samples, result.side ?? pickSide(samples), clip?.t0 ?? 0);
    if (frames.length) {
      const id = `${record.date}-0`;
      liveClip = { id, label: 'Deine Messung', blob, frames, w, h, saved: false };
      banner('Video wird gespeichert …');
      // ein hochgeladenes Video kann groß sein – dafür mehr Zeit lassen
      liveClip.saved = !!(await within(putClip({ id, label: liveClip.label, blob, frames, w, h }).then(() => true, () => false),
        mode === 'file' ? 60000 : 5000));
      if (liveClip.saved) record.clips.push({ id, label: liveClip.label });
    }
  }

  const previous = loadHistory()[0] ?? null;
  if (result.ok) {
    const list = [record, ...loadHistory()].slice(0, 12);
    saveHistory(list);
    // Videos nur für die vier neuesten Messungen behalten
    pruneClips(list.filter((r) => r.clips?.length).slice(0, 4).flatMap((r) => r.clips.map((c) => c.id))).catch(() => {});
  }
  showRecord(record, { previous, liveClip });
}

/** Videoplayer mit halbtransparenter, nach Status eingefärbter Umrandung und Zeitleiste. */
function clipPlayer(clip, label, styleKey, cadence) {
  const { frames, w, h } = clip;
  const st = clipStatuses(frames, styleKey, cadence);
  const dur = frames[frames.length - 1].t;
  const wrap = el('section', 'clip');
  const stage = el('div', 'clipstage');
  const vid = el('video');
  vid.playsInline = true; vid.muted = true; vid.loop = true; vid.preload = 'auto';
  vid.setAttribute('playsinline', '');
  const url = URL.createObjectURL(clip.blob);
  vid.src = url;
  const cv = el('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  const playIcon = el('div', 'clipplay', 'Abspielen');
  stage.append(vid, cv, playIcon);
  stage.style.aspectRatio = `${w} / ${h}`;

  let outline = true, joints = true, cur = -1;
  let pinned = null; // im Pausenzustand gewähltes Einzelbild – unabhängig davon, wie genau das Video spult
  const rows = REGIONS.map((r) => {
    const row = el('div', 'tl');
    const name = el('div', 'tlname');
    const state = el('small');
    name.append(el('b', null, r.label), state);
    const bar = el('div', 'tlbar');
    // Abschnitte gleicher Farbe zusammenfassen
    let start = 0;
    for (let i = 1; i <= frames.length; i++) {
      if (i === frames.length || st[r.key][i] !== st[r.key][start]) {
        const seg = el('i', st[r.key][start] ?? 'none');
        const t1 = i === frames.length ? dur : frames[i].t;
        seg.style.left = `${(frames[start].t / dur) * 100}%`;
        seg.style.width = `${((t1 - frames[start].t) / dur) * 100}%`;
        bar.append(seg);
        start = i;
      }
    }
    const head = el('span', 'tlhead');
    bar.append(head);
    bar.onpointerdown = (e) => {
      const box = bar.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * dur;
      try { vid.currentTime = t / 1000; } catch { /* nicht spulbar */ }
      pinned = vid.paused ? frameAt(frames, t) : null;
      render(t);
    };
    const sh = share(st[r.key]);
    row.append(name, bar, el('div', 'tlshare', `${Math.round(sh.ok * 100)} %`));
    row.title = r.what;
    return { key: r.key, state, head };
  });

  function render(tMs) {
    const i = frameAt(frames, tMs);
    for (const r of rows) r.head.style.left = `${Math.min(100, (tMs / dur) * 100)}%`;
    if (i === cur) return;
    cur = i;
    const now = { leg: st.leg[i], torso: st.torso[i], arm: st.arm[i] };
    if (outline) drawOutline(cx, frames[i], now, w, h); else cx.clearRect(0, 0, w, h);
    if (joints) drawJoints(cx, frames[i], st.angles[i], w, h);
    for (const r of rows) r.state.textContent = now[r.key] ? STATUS_TEXT[now[r.key]] : 'nicht sichtbar';
    const a = st.angles[i];
    for (const r of readout) {
      const v = !a ? null : r.key === 'kneeExt' ? st.kneeMax[i] : (r.arm && !frames[i].a) ? null : a[r.key];
      r.val.textContent = v == null ? '–' : `${de(v, 0)}°`;
      const s = v != null && r.rated ? statusOf(r.key, v, styleKey) : null;
      r.badge.className = `badge ${s ?? 'info'}`;
      r.badge.firstChild.textContent = s ? STATUS_TEXT[s] : r.rated ? '–' : 'ohne Zielwert';
    }
  }
  const tick = (_, meta) => {
    if (!wrap.isConnected) { URL.revokeObjectURL(url); return; }
    if (pinned != null && vid.paused) render(frames[pinned].t);
    else { pinned = null; render((meta?.mediaTime ?? vid.currentTime) * 1000); }
    if (vid.requestVideoFrameCallback) vid.requestVideoFrameCallback(tick); else requestAnimationFrame(() => tick());
  };
  vid.addEventListener('loadeddata', () => { render(0); tick(); }, { once: true });

  const redraw = () => { const i = Math.max(0, cur); cur = -1; render(frames[i].t); };
  const toggle = () => { if (vid.paused) vid.play().catch(() => {}); else vid.pause(); };
  stage.onclick = toggle;
  vid.onplay = () => { playIcon.hidden = true; playBtn.textContent = 'Pause'; };
  vid.onpause = () => { playIcon.hidden = false; playBtn.textContent = 'Abspielen'; };
  const playBtn = el('button', 'textbtn', 'Abspielen');
  playBtn.onclick = toggle;
  const slowBtn = el('button', 'textbtn', 'Zeitlupe');
  slowBtn.onclick = () => {
    vid.playbackRate = vid.playbackRate === 1 ? 0.35 : 1;
    slowBtn.textContent = vid.playbackRate === 1 ? 'Zeitlupe' : 'Normales Tempo';
  };
  const lineBtn = el('button', 'textbtn', 'Umrandung aus');
  lineBtn.onclick = () => {
    outline = !outline;
    lineBtn.textContent = outline ? 'Umrandung aus' : 'Umrandung an';
    redraw();
  };
  const jointBtn = el('button', 'textbtn', 'Gelenke aus');
  jointBtn.onclick = () => {
    joints = !joints;
    jointBtn.textContent = joints ? 'Gelenke aus' : 'Gelenke an';
    redraw();
  };
  // Einzelbild vor/zurück – zum genauen Hinsehen
  const stepTo = (d) => {
    vid.pause();
    const i = Math.max(0, Math.min(frames.length - 1, (cur < 0 ? 0 : cur) + d));
    pinned = i;
    try { vid.currentTime = frames[i].t / 1000 + 0.001; } catch { /* nicht spulbar */ }
    render(frames[i].t);
  };
  const backBtn = el('button', 'textbtn', '‹ Bild');
  backBtn.onclick = () => stepTo(-1);
  const fwdBtn = el('button', 'textbtn', 'Bild ›');
  fwdBtn.onclick = () => stepTo(1);
  const controls = el('div', 'clipctl');
  controls.append(playBtn, backBtn, fwdBtn, slowBtn, lineBtn, jointBtn);

  // Winkel im aktuellen Bild
  const table = el('div', 'angles');
  const rng = (key) => { const [lo, hi] = rangeOf(key, styleKey); return `Ziel ${lo}–${hi}°`; };
  const readout = [
    { key: 'kneeExt', label: 'Kniestreckung', sub: `größter Winkel dieser Umdrehung · ${rng('kneeExt')}`, rated: true },
    { key: 'knee', label: 'Knie jetzt', sub: 'Winkel in diesem Bild', rated: false },
    { key: 'torso', label: 'Oberkörper', sub: `Neigung zur Waagerechten · ${rng('torso')}`, rated: true },
    { key: 'hip', label: 'Hüfte', sub: 'Oberkörper zu Oberschenkel', rated: false },
    { key: 'shoulder', label: 'Schulter', sub: `Oberkörper zu Oberarm · ${rng('shoulder')}`, rated: true, arm: true },
    { key: 'elbow', label: 'Ellbogen', sub: `Oberarm zu Unterarm · ${rng('elbow')}`, rated: true, arm: true },
  ].map((r) => {
    const row = el('div', 'arow'), left = el('div'), b = el('span', 'badge info');
    b.append(el('span', null, '–'));
    left.append(el('b', null, r.label), el('small', null, r.sub));
    const val = el('div', 'aval', '–');
    row.append(left, b, val);
    table.append(row);
    return { ...r, val, badge: b };
  });
  const tl = el('div', 'tlwrap');
  const tlhead = el('div', 'tl tlcap');
  tlhead.append(el('div', 'tlname'), el('div', null, 'Verlauf im Video'), el('div', 'tlshare', 'im Ziel'));
  tl.append(tlhead);
  for (const [i, r] of rows.entries()) tl.append(r.head.parentElement.parentElement);
  const legend = el('div', 'legend');
  for (const k of ['ok', 'warn', 'bad']) { const b = badge(k); legend.append(b); }
  wrap.append(el('div', 'clipcap', label), stage, controls, tl, legend, el('div', 'clipcap anglecap', 'Winkel im aktuellen Bild'), table);
  return wrap;
}

// ---------- Ergebnis ----------
const STATUS_TEXT = { ok: 'Im Zielbereich', warn: 'Leicht daneben', bad: 'Anpassen' };
const badge = (status) => {
  const b = el('span', `badge ${status}`);
  b.append(el('span', null, STATUS_TEXT[status]));
  return b;
};

function scoreCard(ev) {
  const card = el('section', 'card scorecard');
  const ring = el('div', 'ring');
  const svg = svgEl('svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true' }, ring);
  const C = 2 * Math.PI * 52;
  svgEl('circle', { cx: 60, cy: 60, r: 52, fill: 'none', stroke: '#d6d1c6', 'stroke-width': 1.5 }, svg);
  svgEl('circle', {
    cx: 60, cy: 60, r: 52, fill: 'none', stroke: '#111110', 'stroke-width': 3.5, 'stroke-linecap': 'butt',
    'stroke-dasharray': `${(C * Math.max(0, ev.score)) / 100} ${C}`,
  }, svg);
  const num = el('div', 'num');
  num.append(el('b', null, String(ev.score)), el('small', null, 'von 100'));
  ring.append(num);
  const open = ev.items.filter((i) => i.status !== 'ok').length;
  const txt = el('div');
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
function showRecord(rec, { previous = null, demo = false, stored = false, liveClip = null } = {}) {
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

  body.append(scoreCard(ev), statTiles(result, stab));
  if (ev.top) {
    const top = el('section', 'card topcard');
    top.append(el('div', 'eyebrow', 'Wichtigste Anpassung'), el('h2', null, ev.top.action), el('p', null, ev.top.tip));
    body.append(top);
  }
  for (const w of result.warnings ?? []) body.append(el('p', 'alert', w));
  const clipHost = el('div');
  body.append(clipHost);
  if (liveClip) {
    // gerade gemessen: Video direkt aus dem Arbeitsspeicher zeigen
    clipHost.append(clipPlayer(liveClip, liveClip.label, rec.style, result.cadence));
    if (!liveClip.saved) clipHost.append(el('p', 'hint clipnote', 'Das Video ließ sich nicht dauerhaft speichern (zu groß oder Speicher voll). Es ist nur jetzt zu sehen – die Messwerte bleiben erhalten.'));
  } else if (rec.clips?.length) {
    // Videos liegen in der Datenbank des Browsers und werden nachgeladen
    (async () => {
      let shown = 0;
      for (const c of rec.clips) {
        const clip = await getClip(c.id);
        if (clip?.blob && clip.frames?.length && clipHost.isConnected) {
          clipHost.append(clipPlayer(clip, c.label, rec.style, result.cadence));
          shown++;
        }
      }
      if (!shown && clipHost.isConnected) clipHost.append(el('p', 'hint clipnote', 'Das Video dieser Messung ist nicht mehr gespeichert – es wird nur für die vier neuesten Messungen aufbewahrt.'));
    })();
  } else if (stored && rec.result) {
    clipHost.append(el('p', 'hint clipnote', 'Zu dieser Messung gibt es kein Video. Es wird erst seit Version 8 mit aufgezeichnet.'));
  }
  if (rec.snapshot && !liveClip && !rec.clips?.length) {
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
      const list = loadHistory().filter((r) => r.date !== rec.date);
      saveHistory(list);
      pruneClips(list.filter((r) => r.clips?.length).slice(0, 4).flatMap((r) => r.clips.map((c) => c.id)));
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

// ---------- Bedienung ----------
$('startBtn').onclick = () => start('camera');
$('fileInput').onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) start('file', file);
};
$('demoBtn').onclick = () => {
  const rec = buildRecord(analyzeSession(syntheticSession({ saddleHeight: 73, torsoDeg: 41 }), settings()));
  showRecord(rec, { demo: true });
};
$('cancelBtn').onclick = () => { stopMedia(); renderHistory(); show('setup'); };
$('againBtn').onclick = () => { renderHistory(); show('setup'); };
$('switchBtn').onclick = async () => {
  state.facing = state.facing === 'user' ? 'environment' : 'user';
  try { await openCamera(); beginCountdown(); } catch (err) { console.error(err); }
};
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || state.phase === 'idle') return;
  stopMedia(); renderHistory(); show('setup');
});

initSetup();
initHero($('heroSvg'),
  () => ({ style: prefs.style, bike: findBike(prefs.bike) }),
  () => $('setup').offsetParent !== null && !document.hidden);
renderHistory();
