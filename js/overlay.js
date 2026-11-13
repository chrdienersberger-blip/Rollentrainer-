// Farbige Umrandung der Person im aufgezeichneten Video.
// Die Silhouette wird aus den Gelenkpunkten aufgebaut (Bein, Oberkörper, Arm)
// und je Körperbereich danach eingefärbt, ob er im Zielbereich liegt.

import { frameAngles, median } from './analysis.js?v=12';
import { statusOf } from './evaluate.js?v=12';

export const REGIONS = [
  { key: 'leg', label: 'Bein', what: 'Kniestreckung je Umdrehung' },
  { key: 'torso', label: 'Oberkörper', what: 'Neigung zur Waagerechten' },
  { key: 'arm', label: 'Arme', what: 'Schulter- und Ellbogenwinkel' },
];
const RANK = { ok: 0, warn: 1, bad: 2 };
const worst = (a, b) => (RANK[a] >= RANK[b] ? a : b);

/** frames: [{ t, p: { gelenk: [x, y] }, a (Arm sichtbar), c (Körper sichtbar) }] → Status je Bild und Bereich. */
export function clipStatuses(frames, styleKey, cadence = 85) {
  const pts = (f) => Object.fromEntries(Object.entries(f.p).map(([k, [x, y]]) => [k, { x, y }]));
  const ang = frames.map((f) => (f.c ? frameAngles(pts(f)) : null));
  const half = 60000 / (cadence || 85) / 2;
  const out = { leg: [], torso: [], arm: [] };
  const angles = [], kneeMax = [];
  let lo = 0, hi = 0;
  frames.forEach((f, i) => {
    angles.push(ang[i]);
    if (!ang[i]) { out.leg.push(null); out.torso.push(null); out.arm.push(null); kneeMax.push(null); return; }
    // Bein: größte Kniestreckung innerhalb einer Kurbelumdrehung um dieses Bild
    while (frames[lo].t < f.t - half) lo++;
    while (hi + 1 < frames.length && frames[hi + 1].t <= f.t + half) hi++;
    let kMax = -Infinity;
    for (let j = lo; j <= hi; j++) if (ang[j]) kMax = Math.max(kMax, ang[j].knee);
    const full = frames[hi].t - frames[lo].t >= half * 1.5; // am Rand fehlt ein Teil der Umdrehung
    out.leg.push(full ? statusOf('kneeExt', kMax, styleKey) : null);
    kneeMax.push(full ? kMax : null);
    // Oberkörper und Arme: leicht geglätteter Momentanwert
    const near = ang.slice(Math.max(0, i - 4), i + 5).filter(Boolean);
    out.torso.push(statusOf('torso', median(near.map((a) => a.torso)), styleKey));
    out.arm.push(f.a ? worst(
      statusOf('elbow', median(near.map((a) => a.elbow)), styleKey),
      statusOf('shoulder', median(near.map((a) => a.shoulder)), styleKey)) : null);
  });
  // Lücken am Rand mit dem nächsten bekannten Wert füllen
  for (const arr of Object.values(out)) {
    for (let i = 1; i < arr.length; i++) arr[i] ??= arr[i - 1];
    for (let i = arr.length - 2; i >= 0; i--) arr[i] ??= arr[i + 1];
  }
  for (let i = 1; i < kneeMax.length; i++) kneeMax[i] ??= kneeMax[i - 1];
  for (let i = kneeMax.length - 2; i >= 0; i--) kneeMax[i] ??= kneeMax[i + 1];
  // Einzelwinkel je Bild (für die Anzeige im Video) – nicht Teil der drei Bereiche
  Object.defineProperties(out, { angles: { value: angles }, kneeMax: { value: kneeMax } });
  return out;
}

/** Anteil der Zeit je Status, z. B. { ok: 0.8, warn: 0.2, bad: 0 }. */
export function share(statuses) {
  const n = statuses.filter(Boolean).length || 1;
  const s = { ok: 0, warn: 0, bad: 0 };
  for (const v of statuses) if (v) s[v] += 1 / n;
  return s;
}

/** Index des Bildes zur Abspielzeit t (ms). */
export function frameAt(frames, t) {
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

const RGB = { ok: '53,208,127', warn: '255,201,60', bad: '255,90,77', null: '255,255,255' };

function capsule(path, a, b, r1, r2) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  // gleiche Umlaufrichtung wie die Kreise, sonst entstehen beim Füllen Löcher
  path.moveTo(a[0] - nx * r1, a[1] - ny * r1);
  path.lineTo(b[0] - nx * r2, b[1] - ny * r2);
  path.lineTo(b[0] + nx * r2, b[1] + ny * r2);
  path.lineTo(a[0] + nx * r1, a[1] + ny * r1);
  path.closePath();
  for (const [p, r] of [[a, r1], [b, r2]]) { path.moveTo(p[0] + r, p[1]); path.arc(p[0], p[1], r, 0, Math.PI * 2); }
}

/** Zeichnet die halbtransparente Umrandung für ein Bild. st = { leg, torso, arm } Status dieses Bildes. */
export function drawOutline(ctx, frame, st, w, h) {
  ctx.clearRect(0, 0, w, h);
  if (!frame?.c) return;
  const p = frame.p;
  const S = Math.hypot(p.knee[0] - p.ankle[0], p.knee[1] - p.ankle[1]) || 1; // Unterschenkel als Maßstab
  const leg = new Path2D(), torso = new Path2D(), arm = new Path2D();
  capsule(leg, p.hip, p.knee, 0.21 * S, 0.14 * S);
  capsule(leg, p.knee, p.ankle, 0.13 * S, 0.08 * S);
  if (p.heel && p.toe) capsule(leg, p.heel, p.toe, 0.08 * S, 0.06 * S);
  capsule(torso, p.shoulder, p.hip, 0.2 * S, 0.24 * S);
  if (p.ear) {
    capsule(torso, p.shoulder, p.ear, 0.11 * S, 0.1 * S);
    torso.moveTo(p.ear[0] + 0.21 * S, p.ear[1]);
    torso.arc(p.ear[0], p.ear[1], 0.21 * S, 0, Math.PI * 2);
  }
  if (frame.a) {
    capsule(arm, p.shoulder, p.elbow, 0.1 * S, 0.08 * S);
    capsule(arm, p.elbow, p.wrist, 0.08 * S, 0.06 * S);
  }
  const regions = [[torso, st.torso], [leg, st.leg], [arm, frame.a ? st.arm : null]];
  const band = Math.max(3, S * 0.045);
  ctx.lineJoin = 'round';
  ctx.lineWidth = band * 2;
  for (const [path, s] of regions) { ctx.strokeStyle = `rgba(${RGB[s]},0.85)`; ctx.stroke(path); }
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (const [path] of regions) ctx.fill(path);
  ctx.globalCompositeOperation = 'source-over';
  for (const [path, s] of regions) { ctx.fillStyle = `rgba(${RGB[s]},0.16)`; ctx.fill(path); }
}

/** Zeichnet Gelenke, Verbindungslinien und Winkelwerte für ein Bild. ang = Winkel dieses Bildes. */
export function drawSkeleton(ctx, frame, ang, w, h) {
  if (!frame?.c || !ang) return;
  const p = frame.p;
  const S = Math.hypot(p.knee[0] - p.ankle[0], p.knee[1] - p.ankle[1]) || 1;
  const u = Math.max(1.5, S / 60);
  const chain = (pts) => {
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = u * 2.6; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = u * 1.2; ctx.stroke();
  };
  chain([p.shoulder, p.hip, p.knee, p.ankle]);
  if (p.heel && p.toe) chain([p.heel, p.ankle, p.toe]);
  if (frame.a) chain([p.shoulder, p.elbow, p.wrist]);

  // Winkelbogen am Gelenk b zwischen a und c
  const arc = (a, b, c, r) => {
    const a1 = Math.atan2(a[1] - b[1], a[0] - b[0]), a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let sweep = a2 - a1;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    ctx.beginPath();
    ctx.arc(b[0], b[1], r, a1, a2, sweep < 0);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = u * 2.2; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = u; ctx.stroke();
  };
  const label = (text, x, y, align = 'left') => {
    ctx.font = `600 ${Math.round(u * 9)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = u * 2.6; ctx.strokeText(text, x, y);
    ctx.fillStyle = '#fff'; ctx.fillText(text, x, y);
  };
  const dir = Math.sign(p.shoulder[0] - p.hip[0]) || 1; // Blickrichtung im Bild
  const r = 0.28 * S;
  arc(p.hip, p.knee, p.ankle, r);
  label(`${Math.round(ang.knee)}°`, p.knee[0] + dir * 0.4 * S, p.knee[1], dir > 0 ? 'left' : 'right');
  arc(p.shoulder, p.hip, p.knee, r);
  label(`${Math.round(ang.hip)}°`, p.hip[0] - dir * 0.42 * S, p.hip[1], dir > 0 ? 'right' : 'left');
  if (frame.a) {
    arc(p.hip, p.shoulder, p.elbow, r * 0.8);
    label(`${Math.round(ang.shoulder)}°`, p.shoulder[0] - dir * 0.3 * S, p.shoulder[1] - 0.3 * S, dir > 0 ? 'right' : 'left');
    arc(p.shoulder, p.elbow, p.wrist, r * 0.7);
    label(`${Math.round(ang.elbow)}°`, p.elbow[0], p.elbow[1] + 0.36 * S, 'center');
  }
  ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = u * 0.8;
  for (const k of ['shoulder', 'hip', 'knee', 'ankle', ...(frame.a ? ['elbow', 'wrist'] : [])]) {
    ctx.beginPath(); ctx.arc(p[k][0], p[k][1], u * 2.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
