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

/**
 * Maße in cm, Ursprung = Tretlager, x nach vorn, y nach oben.
 * Rückgabe: Samples im selben Format wie die Live-Aufnahme (Pixel, y nach unten).
 */
export function syntheticSession({
  saddleHeight = 74, torsoDeg = 45, cadence = 88, seconds = 30, fps = 25,
  thigh = 42, shank = 43, crank = 17.25, noise = 0.15, scale = 6,
} = {}) {
  const rad = (d) => (d * Math.PI) / 180;
  const hip = { x: -saddleHeight * Math.cos(rad(73)), y: saddleHeight * Math.sin(rad(73)) };
  const shoulder = { x: hip.x + 50 * Math.cos(rad(torsoDeg)), y: hip.y + 50 * Math.sin(rad(torsoDeg)) };
  const wrist = { x: hip.x + 83, y: hip.y + 11 };
  const elbow = circleIntersect(shoulder, 30, wrist, 27, (p, q) => (p.y < q.y ? p : q));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * noise;
  const px = (p, v = 1) => ({ x: (p.x + 60 + rnd()) * scale, y: (130 - p.y + rnd()) * scale, v });

  const samples = [];
  for (let i = 0; i < seconds * fps; i++) {
    const t = (i * 1000) / fps;
    const th = (2 * Math.PI * cadence * t) / 60000; // 0 = Kurbel oben, vorwärts im Uhrzeigersinn
    const spindle = { x: crank * Math.sin(th), y: crank * Math.cos(th) };
    const ankle = { x: spindle.x - 11, y: spindle.y + 8 };
    const heel = { x: spindle.x - 16, y: spindle.y + 2 };
    const toe = { x: spindle.x + 7, y: spindle.y - 1 };
    const knee = circleIntersect(hip, thigh, ankle, shank, (p, q) => (p.x > q.x ? p : q));
    const pts = (v) => ({
      shoulder: px(shoulder, v), elbow: px(elbow, v), wrist: px(wrist, v), hip: px(hip, v),
      knee: px(knee, v), ankle: px(ankle, v), heel: px(heel, v), toe: px(toe, v),
    });
    samples.push({ t, right: pts(0.95), left: pts(0.3), span: 3 * scale });
  }
  return samples;
}
