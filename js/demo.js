// Erzeugt eine künstliche Aufnahme (Fahrer als Gelenkmodell) – für die
// Demo-Auswertung in der App und für die Tests.

function circleIntersect(a, ra, b, rb, pick) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const l = (ra * ra - rb * rb + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, ra * ra - l * l));
  const mx = a.x + (l * (b.x - a.x)) / d, my = a.y + (l * (b.y - a.y)) / d;
  const ox = (h * (b.y - a.y)) / d, oy = (-h * (b.x - a.x)) / d;
  const p1 = { x: mx + ox, y: my + oy }, p2 = { x: mx - ox, y: my - oy };
  return pick(p1, p2);
}

const rad = (d) => (d * Math.PI) / 180;

/**
 * Gelenkpunkte des Fahrermodells in cm (Ursprung = Tretlager, x nach vorn, y nach oben).
 * th = Kurbelwinkel in rad, 0 = oben, vorwärts im Uhrzeigersinn.
 */
export function riderPose(th, {
  saddleHeight = 74, torsoDeg = 45, thigh = 42, shank = 43, crank = 17.25, wristOffset = { x: 83, y: 11 },
} = {}) {
  const hip = { x: -saddleHeight * Math.cos(rad(73)), y: saddleHeight * Math.sin(rad(73)) };
  const shoulder = { x: hip.x + 50 * Math.cos(rad(torsoDeg)), y: hip.y + 50 * Math.sin(rad(torsoDeg)) };
  const wrist = { x: hip.x + wristOffset.x, y: hip.y + wristOffset.y };
  const elbow = circleIntersect(shoulder, 30, wrist, 27, (p, q) => (p.y < q.y ? p : q));
  const spindle = { x: crank * Math.sin(th), y: crank * Math.cos(th) };
  const ankle = { x: spindle.x - 11, y: spindle.y + 8 };
  const heel = { x: spindle.x - 16, y: spindle.y + 2 };
  const toe = { x: spindle.x + 7, y: spindle.y - 1 };
  const knee = circleIntersect(hip, thigh, ankle, shank, (p, q) => (p.x > q.x ? p : q));
  return { shoulder, elbow, wrist, hip, knee, ankle, heel, toe, spindle };
}

/** Künstliche Aufnahme im selben Format wie die Live-Aufnahme (Pixel, y nach unten). */
export function syntheticSession({
  cadence = 88, seconds = 30, fps = 25, noise = 0.15, scale = 6, ...model
} = {}) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * noise;
  const px = (p, v = 1) => ({ x: (p.x + 60 + rnd()) * scale, y: (130 - p.y + rnd()) * scale, v });
  const samples = [];
  for (let i = 0; i < seconds * fps; i++) {
    const t = (i * 1000) / fps;
    const pose = riderPose((2 * Math.PI * cadence * t) / 60000, model);
    const pts = (v) => Object.fromEntries(
      ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'heel', 'toe'].map((k) => [k, px(pose[k], v)]));
    samples.push({ t, right: pts(0.95), left: pts(0.3), span: 3 * scale });
  }
  return samples;
}

/** Künstlicher Verlauf einer Einheit, in der die Haltung ab der Mitte nachlässt. */
export function syntheticFatigueWindows(minutes = 40) {
  let seed = 11;
  const rnd = (a) => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * a;
  const ramp = (m, from, perMin) => Math.max(0, m - from) * perMin;
  const r1 = (v) => Math.round(v * 10) / 10;
  return Array.from({ length: minutes }, (_, i) => {
    const m = i + 1;
    if (m === 13) return { minute: m, ok: false };
    return {
      minute: m, ok: true,
      torso: r1(41 + ramp(m, 18, 0.28) + rnd(0.6)),
      kneeExt: r1(144.5 - ramp(m, 20, 0.27) + rnd(0.7)),
      hipBob: r1(0.9 + ramp(m, 24, 0.09) + rnd(0.15)),
      elbow: r1(154 + ramp(m, 26, 0.5) + rnd(1.5)),
      cadence: Math.round(91 - ramp(m, 10, 0.25) + rnd(1.2)),
    };
  });
}
