// Reine Auswertungslogik (keine Browser-APIs) – läuft auch in Node für Tests.

// MediaPipe-Pose-Indizes je Körperseite
export const LM = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32 },
};

const deg = (rad) => (rad * 180) / Math.PI;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function median(arr) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
}

/** Scheitelwert einer Parabel durch den Extrempunkt i und seine Nachbarn –
 *  gleicht aus, dass die Kamera den Umkehrpunkt selten exakt trifft. */
function peak(arr, i) {
  const a = arr[i - 1], b = arr[i], c = arr[i + 1];
  if (a == null || c == null) return b;
  const den = a - 2 * b + c;
  if (!den) return b;
  const d = ((a - c) ** 2) / (8 * den);
  return b - Math.max(-3, Math.min(3, d));
}

function smooth(arr) {
  return arr.map((v, i) => {
    const a = arr[Math.max(0, i - 1)];
    const c = arr[Math.min(arr.length - 1, i + 1)];
    return (a + v + c) / 3;
  });
}

/** Winkel am Punkt b (in Grad) zwischen den Strecken b→a und b→c. */
export function angleAt(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (!n) return NaN;
  return deg(Math.acos(Math.min(1, Math.max(-1, dot / n))));
}

/** Punkte einer Körperseite in Pixelkoordinaten (y nach unten). */
export function extractSide(landmarks, side, w, h) {
  const out = {};
  for (const [name, idx] of Object.entries(LM[side])) {
    const l = landmarks[idx];
    out[name] = { x: l.x * w, y: l.y * h, v: l.visibility ?? 1 };
  }
  return out;
}

export function coreVisibility(p) {
  return Math.min(p.shoulder.v, p.hip.v, p.knee.v, p.ankle.v);
}

/** Winkel eines Einzelbildes. */
export function frameAngles(p) {
  return {
    knee: angleAt(p.hip, p.knee, p.ankle),
    hip: angleAt(p.shoulder, p.hip, p.knee),
    torso: deg(Math.atan2(Math.abs(p.shoulder.y - p.hip.y), Math.abs(p.shoulder.x - p.hip.x))),
    shoulder: angleAt(p.hip, p.shoulder, p.elbow),
    elbow: angleAt(p.shoulder, p.elbow, p.wrist),
  };
}

/** Der Kamera zugewandte Körperseite = die im Mittel besser sichtbare. */
export function pickSide(samples) {
  let l = 0, r = 0;
  for (const s of samples) {
    l += coreVisibility(s.left);
    r += coreVisibility(s.right);
  }
  return l >= r ? 'left' : 'right';
}

const fail = (reason) => ({ ok: false, reason });

/**
 * Wertet eine Aufnahme aus.
 * samples: [{ t (ms), left: pts, right: pts, span (Schulterbreite im Bild, px) }]
 */
export function analyzeSession(samples, { heightCm = 175 } = {}) {
  if (samples.length < 40) {
    return fail('Es wurden zu wenige Bilder mit erkannter Person aufgenommen.');
  }
  const side = pickSide(samples);
  const frames = samples
    .map((s) => ({ t: s.t, p: s[side], span: s.span }))
    .filter((f) => coreVisibility(f.p) >= 0.5);
  const validRatio = frames.length / samples.length;
  if (frames.length < 40) {
    return fail('Schulter, Hüfte, Knie und Knöchel waren zu selten gleichzeitig gut sichtbar.');
  }

  const ang = frames.map((f) => frameAngles(f.p));
  const knee = ang.map((a) => a.knee);
  const hip = ang.map((a) => a.hip);
  const ankleY = smooth(frames.map((f) => f.p.ankle.y));
  const shankPx = median(frames.map((f) => dist(f.p.knee, f.p.ankle)));
  const thighPx = median(frames.map((f) => dist(f.p.hip, f.p.knee)));
  const torsoPx = median(frames.map((f) => dist(f.p.hip, f.p.shoulder)));
  // Fahrtrichtung im Bild: +1 = nach rechts
  const dir = Math.sign(median(frames.map((f) => f.p.shoulder.x - f.p.hip.x))) || 1;

  // --- Tretzyklen über die Auf-/Abbewegung des Knöchels finden ---
  const lo = percentile(ankleY, 0.05), hi = percentile(ankleY, 0.95);
  const range = hi - lo;
  if (range < 0.15 * shankPx) {
    return fail('Es wurde keine Tretbewegung erkannt. Bitte während der Messung gleichmäßig treten.');
  }
  const mid = (lo + hi) / 2, hyst = range * 0.15;
  const marks = [];
  let below = false;
  ankleY.forEach((y, i) => {
    if (y < mid - hyst) below = true;
    else if (below && y > mid + hyst) { marks.push(i); below = false; }
  });

  let cycles = [];
  for (let k = 0; k + 1 < marks.length; k++) {
    const i0 = marks[k], i1 = marks[k + 1];
    const period = frames[i1].t - frames[i0].t;
    if (period < 300 || period > 2000) continue; // 30–200 U/min
    let gap = 0;
    for (let i = i0 + 1; i <= i1; i++) gap = Math.max(gap, frames[i].t - frames[i - 1].t);
    if (gap > 250 || i1 - i0 < 6) continue;
    cycles.push({ i0, i1, period });
  }
  const medPeriod = median(cycles.map((c) => c.period));
  cycles = cycles.filter((c) => Math.abs(c.period - medPeriod) < 0.35 * medPeriod);
  if (cycles.length < 5) {
    return fail('Zu wenige saubere Kurbelumdrehungen erkannt. Bitte länger und gleichmäßig treten und auf gute Sichtbarkeit achten.');
  }

  const pxPerCm = shankPx / (0.246 * heightCm); // Unterschenkel ≈ 24,6 % der Körpergröße
  const perCycle = { kneeExt: [], kneeFlex: [], hipMin: [], kops: [], hipBob: [] };
  const hipY = smooth(frames.map((f) => f.p.hip.y));
  const BINS = 24;
  const binSum = new Array(BINS).fill(0), binN = new Array(BINS).fill(0);
  for (const { i0, i1, period } of cycles) {
    let iMax = i0, iMin = i0, iHip = i0, fwd = -Infinity, iFwd = i0;
    let hyLo = Infinity, hyHi = -Infinity;
    for (let b = 0, i = i0; b < BINS; b++) { // Kurve auf feste Stützstellen interpolieren
      const tt = frames[i0].t + ((b + 0.5) / BINS) * period;
      while (i + 1 < i1 && frames[i + 1].t <= tt) i++;
      const f = Math.min(1, Math.max(0, (tt - frames[i].t) / (frames[i + 1].t - frames[i].t || 1)));
      binSum[b] += knee[i] + f * (knee[i + 1] - knee[i]); binN[b]++;
    }
    for (let i = i0; i < i1; i++) {
      hyLo = Math.min(hyLo, hipY[i]); hyHi = Math.max(hyHi, hipY[i]);
      if (knee[i] > knee[iMax]) iMax = i;
      if (knee[i] < knee[iMin]) iMin = i;
      if (hip[i] < hip[iHip]) iHip = i;
      const ax = dir * frames[i].p.ankle.x;
      if (ax > fwd) { fwd = ax; iFwd = i; }
    }
    perCycle.kneeExt.push(peak(knee, iMax));
    perCycle.kneeFlex.push(peak(knee, iMin));
    perCycle.hipMin.push(peak(hip, iHip));
    perCycle.hipBob.push((hyHi - hyLo) / pxPerCm);
    // Knielot bei waagerechter Kurbel (Fuß am weitesten vorn)
    const p = frames[iFwd].p;
    if (p.heel.v >= 0.3 && p.toe.v >= 0.3) {
      const spindleX = p.heel.x + 0.7 * (p.toe.x - p.heel.x); // Fußballen ≈ Pedalachse
      const kneeFrontX = p.knee.x + dir * 0.1 * shankPx;      // Kniescheibe liegt vor dem Gelenkzentrum
      perCycle.kops.push((dir * (kneeFrontX - spindleX)) / pxPerCm);
    }
  }

  // Mittlere Kniewinkel-Kurve über eine Kurbelumdrehung, beginnend am oberen Totpunkt
  let curve = binSum.map((v, i) => (binN[i] ? v / binN[i] : null));
  curve = curve.map((v, i) => v ?? curve[(i + BINS - 1) % BINS] ?? curve[(i + 1) % BINS] ?? 0);
  const iTop = curve.indexOf(Math.min(...curve));
  curve = curve.map((_, i) => Math.round(curve[(i + iTop) % BINS] * 10) / 10);
  const extMed = median(perCycle.kneeExt);
  const extSpread = Math.sqrt(median(perCycle.kneeExt.map((v) => (v - extMed) ** 2)));

  const armOk = frames.map((f) => Math.min(f.p.elbow.v, f.p.wrist.v) >= 0.5);
  const armVals = (key) => ang.filter((_, i) => armOk[i]).map((a) => a[key]);
  const armEnough = armOk.filter(Boolean).length >= 20;

  const warnings = [];
  const spanRatio = median(frames.map((f) => f.span)) / torsoPx;
  if (spanRatio > 0.4) {
    warnings.push('Die Kamera steht vermutlich nicht genau seitlich (beide Schultern sind deutlich versetzt zu sehen). Die Winkel können dadurch verfälscht sein.');
  }
  if (validRatio < 0.7) {
    warnings.push('In vielen Bildern waren Gelenke schlecht erkennbar. Besseres Licht, eng anliegende Kleidung und ein ruhiger Hintergrund helfen.');
  }

  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    ok: true,
    side,
    cycles: cycles.length,
    cadence: Math.round(60000 / medPeriod),
    warnings,
    geometry: { thighPx, shankPx, pxPerCm },
    kneeCurve: curve,
    extras: {
      hipBob: r1(median(perCycle.hipBob)),   // Auf-/Abbewegung der Hüfte je Umdrehung (cm)
      extSpread: r1(extSpread),              // Streuung der Kniestreckung zwischen den Umdrehungen (°)
    },
    metrics: {
      kneeExt: r1(median(perCycle.kneeExt)),
      kneeFlex: r1(median(perCycle.kneeFlex)),
      hipMin: r1(median(perCycle.hipMin)),
      torso: r1(median(ang.map((a) => a.torso))),
      shoulder: armEnough ? r1(median(armVals('shoulder'))) : null,
      elbow: armEnough ? r1(median(armVals('elbow'))) : null,
      kops: perCycle.kops.length >= 3 ? r1(median(perCycle.kops)) : null,
    },
  };
}
