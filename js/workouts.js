// Trainingseinheiten, Strecken und die Rechenlogik dazu (ohne Browser-APIs).

// Abschnitt: [Dauer in Sekunden, %FTP am Anfang, %FTP am Ende (bei Rampen)]
const seg = (min, from, to = from) => [Math.round(min * 60), from, to];
const rep = (n, ...segs) => Array.from({ length: n }, () => segs).flat();

export const WORKOUTS = [
  { id: 'first', name: 'Erste Fahrt', focus: 'Einstieg', text: 'Zwanzig lockere Minuten zum Kennenlernen von Rad, Rolle und App.',
    segs: [seg(5, 45, 58), seg(10, 60), seg(5, 58, 45)] },
  { id: 'cadence', name: 'Trittfrequenz-Schule', focus: 'Technik', text: 'Gleiche Leistung, wechselnde Trittfrequenz: fahre die drei Blöcke mit etwa 80, 90 und 100 Umdrehungen pro Minute.',
    segs: [seg(6, 45, 60), ...rep(3, seg(6, 62), seg(2, 50)), seg(4, 55, 45)] },
  { id: 'recovery', name: 'Lockere Runde', focus: 'Regeneration', text: 'Gleichmäßig locker, die Beine drehen sich frei.',
    segs: [seg(5, 45, 55), seg(20, 55), seg(5, 55, 45)] },
  { id: 'endurance', name: 'Grundlage', focus: 'Ausdauer', text: 'Ruhiges Dauertempo mit drei kurzen Antritten.',
    segs: [seg(8, 50, 68), ...rep(3, seg(11, 68), seg(1, 95)), seg(6, 65, 45)] },
  { id: 'sweetspot', name: 'Sweet Spot 3 × 10', focus: 'Schwelle', text: 'Drei Blöcke knapp unter der Schwelle – viel Wirkung, gut verträglich.',
    segs: [seg(10, 50, 75), ...rep(3, seg(10, 90), seg(4, 55)), seg(6, 60, 45)] },
  { id: 'threshold', name: 'Schwelle 2 × 15', focus: 'Schwelle', text: 'Zwei lange Blöcke an der Schwelle.',
    segs: [seg(10, 50, 80), seg(15, 98), seg(6, 55), seg(15, 98), seg(8, 60, 45)] },
  { id: 'vo2', name: 'VO₂max 5 × 3', focus: 'Maximale Sauerstoffaufnahme', text: 'Fünf harte Intervalle mit gleich langen Pausen.',
    segs: [seg(10, 50, 80), seg(2, 55), ...rep(5, seg(3, 118), seg(3, 50)), seg(6, 55, 45)] },
  { id: 'overunder', name: 'Über-Unter 3 × 9', focus: 'Schwelle', text: 'Wechsel knapp unter und über der Schwelle.',
    segs: [seg(10, 50, 80), ...rep(3, ...rep(3, seg(2, 92), seg(1, 106)), seg(5, 55)), seg(5, 55, 45)] },
  { id: 'ramp', name: 'Rampentest', focus: 'FTP bestimmen', text: 'Jede Minute etwas mehr, bis nichts mehr geht. Deine FTP liegt bei etwa 75 % der besten Minute.',
    segs: [seg(5, 45, 50), ...Array.from({ length: 22 }, (_, i) => seg(1, 50 + i * 6))] },
];

// Strecken: Stützpunkte [Kilometer, Höhe in Metern]
export const ROUTES = [
  { id: 'flat', name: 'Flachrunde', text: 'Kaum Höhenmeter – ideal zum Einrollen oder für Tempo.',
    points: [[0, 120], [2, 124], [4.5, 118], [7, 126], [9, 121], [12, 120]] },
  { id: 'hills', name: 'Hügelrunde', text: 'Fünf kurze Wellen mit bis zu 7 %.',
    points: [[0, 210], [2, 215], [3.5, 290], [5, 235], [6.5, 240], [8, 330], [10, 250], [11, 262], [12.5, 345], [14.5, 255], [16, 300], [17, 240], [18, 210]] },
  { id: 'pass', name: 'Passanstieg', text: 'Neun Kilometer bergauf, im Schnitt knapp 7 %.',
    points: [[0, 780], [1, 830], [2.5, 945], [4, 1040], [5, 1125], [6.5, 1215], [7.5, 1300], [9, 1400]] },
];

export const workoutDuration = (w) => w.segs.reduce((s, x) => s + x[0], 0);
export const routeLength = (r) => r.points[r.points.length - 1][0] * 1000;
export const routeClimb = (r) => r.points.reduce((s, p, i) => s + (i ? Math.max(0, p[1] - r.points[i - 1][1]) : 0), 0);

/** Zielleistung zur Zeit t (s). Liefert null nach dem Ende. */
export function targetAt(workout, t, ftp) {
  let start = 0;
  for (const [i, [dur, from, to]] of workout.segs.entries()) {
    if (t < start + dur) {
      const pct = from + ((to - from) * (t - start)) / dur;
      return { watts: Math.round((pct / 100) * ftp), pct, index: i, remaining: start + dur - t };
    }
    start += dur;
  }
  return null;
}

function segmentAt(route, distM) {
  const km = Math.max(0, distM / 1000), pts = route.points;
  let i = 1;
  while (i < pts.length - 1 && pts[i][0] < km) i++;
  return [pts[i - 1], pts[i]];
}
/** Steigung in Prozent an der Stelle distM, begrenzt auf das, was Trainer sinnvoll abbilden. */
export function gradeAt(route, distM) {
  const [a, b] = segmentAt(route, distM);
  return Math.max(-8, Math.min(15, ((b[1] - a[1]) / ((b[0] - a[0]) * 1000)) * 100));
}
export function elevationAt(route, distM) {
  const [a, b] = segmentAt(route, distM);
  const f = Math.max(0, Math.min(1, (distM / 1000 - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * f;
}

/** Neue Geschwindigkeit (m/s) nach dt Sekunden aus Leistung, Steigung und Gesamtmasse. */
export function stepSpeed(v, power, gradePct, massKg, dt = 1) {
  const g = 9.81, crr = 0.004, cda = 0.32, rho = 1.2, eff = 0.97;
  const slope = Math.atan(gradePct / 100);
  let speed = v;
  for (let i = 0; i < 10; i++) {            // in kleinen Schritten, damit es beim Anfahren stabil bleibt
    const resist = massKg * g * (Math.sin(slope) + crr * Math.cos(slope)) + 0.5 * rho * cda * speed * speed;
    const drive = (power * eff) / Math.max(speed, 1);
    speed = Math.max(0, speed + ((drive - resist) / massKg) * (dt / 10));
  }
  return speed;
}

/** Kennzahlen einer Fahrt aus den Sekundenwerten [{ power, cad, hr, dist }]. */
export function summarize(samples, ftp) {
  const n = samples.length;
  if (!n) return { duration: 0, avgPower: 0, np: 0, maxPower: 0, avgCad: 0, avgHr: null, dist: 0, kj: 0, ifactor: 0, tss: 0 };
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const power = samples.map((s) => s.power || 0);
  // Normalized Power: 30-s-Mittel, vierte Potenz, Mittel, vierte Wurzel
  const roll = [];
  let sum = 0;
  power.forEach((p, i) => { sum += p; if (i >= 30) sum -= power[i - 30]; if (i >= 29) roll.push(sum / 30); });
  const np = roll.length ? Math.pow(avg(roll.map((x) => x ** 4)), 0.25) : avg(power);
  const hr = samples.map((s) => s.hr).filter(Boolean);
  const cad = samples.map((s) => s.cad).filter((c) => c > 0);
  const ifactor = ftp ? np / ftp : 0;
  return {
    duration: n, avgPower: Math.round(avg(power)), np: Math.round(np), maxPower: Math.max(...power),
    avgCad: Math.round(avg(cad)), avgHr: hr.length ? Math.round(avg(hr)) : null,
    dist: samples[n - 1].dist ?? 0, kj: Math.round(power.reduce((a, b) => a + b, 0) / 1000),
    ifactor: Math.round(ifactor * 100) / 100, tss: Math.round((n * ifactor * ifactor) / 36),
  };
}

/** Fahrt als TCX-Datei (lässt sich bei Strava, Garmin Connect, TrainingPeaks hochladen). */
export function toTcx(startMs, samples) {
  const iso = (ms) => new Date(ms).toISOString();
  const points = samples.map((s, i) =>
    `<Trackpoint><Time>${iso(startMs + i * 1000)}</Time><DistanceMeters>${(s.dist ?? 0).toFixed(1)}</DistanceMeters>` +
    (s.hr ? `<HeartRateBpm><Value>${Math.round(s.hr)}</Value></HeartRateBpm>` : '') +
    `<Cadence>${Math.round(s.cad || 0)}</Cadence>` +
    `<Extensions><ns3:TPX><ns3:Speed>${((s.speed ?? 0) / 3.6).toFixed(2)}</ns3:Speed><ns3:Watts>${Math.round(s.power || 0)}</ns3:Watts></ns3:TPX></Extensions></Trackpoint>`).join('');
  const dist = samples.length ? samples[samples.length - 1].dist ?? 0 : 0;
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">' +
    `<Activities><Activity Sport="Biking"><Id>${iso(startMs)}</Id><Lap StartTime="${iso(startMs)}">` +
    `<TotalTimeSeconds>${samples.length}</TotalTimeSeconds><DistanceMeters>${dist.toFixed(1)}</DistanceMeters><Calories>0</Calories>` +
    `<Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod><Track>${points}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
}

// Einsteigerplan: vier Wochen, drei Einheiten je Woche. Einträge: [Art, id]
export const PLAN = [
  { title: 'Woche 1 · Ankommen', text: 'Kurz und locker. Es geht nur darum, dich an Rad und Rolle zu gewöhnen.',
    items: [['workout', 'first'], ['workout', 'recovery'], ['workout', 'cadence']] },
  { title: 'Woche 2 · Rhythmus finden', text: 'Etwas länger, weiterhin ruhig – dazu die erste Strecke.',
    items: [['workout', 'recovery'], ['workout', 'endurance'], ['route', 'flat']] },
  { title: 'Woche 3 · Erste Belastung', text: 'Zum ersten Mal knapp unter der Schwelle und ein paar Hügel.',
    items: [['workout', 'endurance'], ['workout', 'sweetspot'], ['route', 'hills']] },
  { title: 'Woche 4 · Standort bestimmen', text: 'Der Rampentest zeigt deine FTP – danach passen alle Workouts genau zu dir.',
    items: [['workout', 'endurance'], ['workout', 'ramp'], ['route', 'pass']] },
];
export const planItem = (kind, id) => (kind === 'workout' ? WORKOUTS : ROUTES).find((x) => x.id === id);

/**
 * Vorbereitung und Verpflegung für eine Einheit – allgemeine Richtwerte der Sporternährung,
 * auf das Körpergewicht umgerechnet. Keine individuelle Ernährungsberatung.
 */
export function prepFor(kind, def, weightKg = 75) {
  const kg = Math.min(150, Math.max(40, Number(weightKg) || 75));
  const minutes = kind === 'workout' ? workoutDuration(def) / 60 : (routeLength(def) / 1000) * (def.id === 'pass' ? 5.5 : 2.4);
  const peak = kind === 'workout' ? Math.max(...def.segs.map((x) => Math.max(x[1], x[2]))) : { flat: 70, hills: 90, pass: 100 }[def.id] ?? 80;
  const level = peak >= 96 ? 'hard' : peak >= 76 || minutes >= 40 ? 'moderate' : 'easy';
  const g = (perKg) => Math.round((kg * perKg) / 5) * 5;
  const kit = 'Ventilator, Handtuch und eine volle Trinkflasche in Griffweite.';
  if (level === 'easy') {
    return { level, label: 'Locker', kit,
      before: 'Keine besondere Vorbereitung nötig. Die letzte größere Mahlzeit sollte 2–3 Stunden zurückliegen; trink davor ein Glas Wasser.',
      during: 'Eine Flasche Wasser (etwa 500 ml) reicht.',
      after: 'Iss danach ganz normal.' };
  }
  if (level === 'moderate') {
    return { level, label: 'Mittel', kit,
      before: `2–3 Stunden vorher eine kohlenhydratreiche Mahlzeit mit etwa ${g(1)} g Kohlenhydraten (rund 1 g je kg Körpergewicht), zum Beispiel Haferflocken mit Banane oder Nudeln mit Tomatensauce. Liegt das Essen länger zurück: 30 Minuten vorher eine Banane.`,
      during: `500–750 ml Wasser je Stunde.${minutes >= 60 ? ' Weil die Einheit eine Stunde oder länger dauert, zusätzlich etwa 30 g Kohlenhydrate je Stunde, zum Beispiel eine Banane oder ein Riegel.' : ''}`,
      after: 'Eine normale Mahlzeit mit Kohlenhydraten und Eiweiß innerhalb von ein bis zwei Stunden.' };
  }
  return { level, label: 'Hart', kit,
    before: `2–3 Stunden vorher ${g(1.5)}–${g(2)} g Kohlenhydrate (1,5–2 g je kg Körpergewicht) mit wenig Fett und Ballaststoffen, zum Beispiel Reis oder Nudeln mit magerer Beilage, Haferbrei mit Honig oder Weißbrot mit Marmelade. 15 Minuten vor dem Start nach Wunsch noch 20–30 g schnelle Kohlenhydrate (Banane oder Gel). Geh ausgeruht in die Einheit.`,
    during: `Etwa 750 ml je Stunde, drinnen am besten mit Elektrolyten.${minutes >= 45 ? ' Dazu 30–60 g Kohlenhydrate je Stunde über Getränk, Gel oder Riegel.' : ''}`,
    after: 'Innerhalb einer Stunde 20–25 g Eiweiß und Kohlenhydrate, zum Beispiel Quark mit Obst und Haferflocken oder ein belegtes Brot mit Ei.' };
}
