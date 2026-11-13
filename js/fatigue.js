// Ermüdungs-Check: Auswertung der Haltung über eine ganze Einheit.
// Pro Minute wird ein kurzes Messfenster ausgewertet; hier werden die Fenster
// zu Verlauf, Drift und Befunden zusammengefasst. Schwellen sind Richtwerte.

import { median } from './analysis.js';

/** Jede Minute wird zu Beginn `burstMs` lang gemessen, danach pausiert die Erkennung (schont Akku). */
export const WINDOW = { periodMs: 60000, burstMs: 20000 };

export const TRACKS = [
  { key: 'torso', label: 'Oberkörperwinkel', unit: '°', notable: 3, strong: 6, weight: 35 },
  { key: 'kneeExt', label: 'Kniestreckung', unit: '°', notable: 3, strong: 6, weight: 30 },
  { key: 'hipBob', label: 'Hüftbewegung', unit: ' cm', notable: 1, strong: 2, weight: 25, onlyUp: true },
  { key: 'elbow', label: 'Ellbogenwinkel', unit: '°', notable: 6, strong: 12, weight: 10 },
  { key: 'cadence', label: 'Trittfrequenz', unit: ' U/min', notable: 6, strong: 12, weight: 0, digits: 0 },
];

/** Kompakter Eintrag für eine Minute aus dem Ergebnis von analyzeSession. */
export function windowFromResult(minute, result) {
  if (!result.ok) return { minute, ok: false };
  const m = result.metrics;
  return { minute, ok: true, torso: m.torso, kneeExt: m.kneeExt, elbow: m.elbow, hipBob: result.extras.hipBob, cadence: result.cadence };
}

const TEXT = {
  torso: {
    up: ['Dein Oberkörper richtet sich auf', 'Typisch, wenn Rumpf und Nacken ermüden oder das Cockpit für lange Einheiten zu tief oder zu weit weg ist. Rumpfkraft trainieren – oder das Cockpit 5–10 mm höher testen und die Messung wiederholen.'],
    down: ['Du sinkst nach vorn ein', 'Arme und Schultern geben nach, das Gewicht wandert auf die Hände. Sattelneigung (waagerecht) und Sitzlänge prüfen; auch ein kräftigerer Rumpf entlastet die Arme.'],
  },
  kneeExt: {
    up: ['Dein Bein streckt sich zunehmend stärker', 'Du rutschst vermutlich auf dem Sattel nach hinten oder senkst die Ferse stärker ab – ein Zeichen müder Waden. Liegt die Streckung am Ende über 150°, den Sattel 3–5 mm tiefer testen.'],
    down: ['Dein Bein streckt sich zunehmend weniger', 'Du rutschst vermutlich auf dem Sattel nach vorn oder kippst das Becken. Sattelneigung (waagerecht) und Sattelform prüfen; oft hilft auch ein etwas kürzeres Cockpit.'],
  },
  hipBob: {
    up: ['Dein Becken wird unruhiger', 'Mit der Ermüdung fehlt die Stabilität im Sattel. Liegt die Sattelhöhe an der oberen Grenze, zeigt sich das erst jetzt: Sattel 3–5 mm tiefer testen.'],
  },
  elbow: {
    up: ['Du streckst die Arme zunehmend durch', 'Schultern und Trizeps ermüden, die Arme „verriegeln“. Stöße gehen dann in Nacken und Schultern. Ein etwas höheres oder kürzeres Cockpit entlastet.'],
    down: ['Du beugst die Arme zunehmend stärker', 'Du stützt dich tiefer ab. Solange der Oberkörper stabil bleibt, ist das unkritisch.'],
  },
  cadence: {
    up: ['Deine Trittfrequenz steigt', 'Kein Haltungsproblem – nur zur Einordnung der anderen Werte.'],
    down: ['Deine Trittfrequenz fällt', 'Kein Haltungsproblem für sich, aber ein Zeichen von Ermüdung – oder dein Training sah es so vor.'],
  },
};

/**
 * windows: [{ minute, ok, torso, kneeExt, hipBob, elbow, cadence }]
 * Vergleicht den Beginn der Einheit mit ihrem Ende.
 */
export function summarizeFatigue(windows) {
  const valid = windows.filter((w) => w.ok);
  if (valid.length < 6) {
    return { ok: false, reason: 'Für einen Verlauf braucht es mindestens sechs auswertbare Minuten. Bitte länger fahren und darauf achten, dass du durchgehend gut im Bild bist.' };
  }
  const n = Math.max(2, Math.min(5, Math.floor(valid.length / 4)));
  const tracks = [], findings = [];
  let penalty = 0;

  for (const t of TRACKS) {
    const pts = valid.filter((w) => w[t.key] != null).map((w) => ({ minute: w.minute, value: w[t.key] }));
    if (pts.length < 6) continue;
    const vals = pts.map((p) => p.value);
    const base = median(vals.slice(0, n)), end = median(vals.slice(-n));
    const drift = Math.round((end - base) * 10) / 10;
    const mag = t.onlyUp ? Math.max(0, drift) : Math.abs(drift);
    const level = mag >= t.strong ? 'strong' : mag >= t.notable ? 'notable' : 'none';
    penalty += t.weight * Math.min(1, mag / (2 * t.strong));

    // Beginn der Veränderung: erste Minute, ab der der geglättete Wert dauerhaft abweicht
    let onset = null;
    if (level !== 'none') {
      const sm = vals.map((_, i) => median(vals.slice(Math.max(0, i - 1), i + 2)));
      const off = (v) => Math.sign(drift) * (v - base) >= t.notable;
      for (let i = n; i < sm.length - 1; i++) {
        if (off(sm[i]) && off(sm[i + 1])) { onset = pts[i].minute; break; }
      }
    }
    tracks.push({ ...t, points: pts, base, end, drift, level, onset });
    if (level !== 'none') {
      const [title, tip] = TEXT[t.key][drift > 0 ? 'up' : 'down'];
      findings.push({ key: t.key, level, title, tip, base, end, drift, onset, unit: t.unit, digits: t.digits ?? 1, scored: t.weight > 0 });
    }
  }
  findings.sort((a, b) => (b.scored - a.scored) || (b.level === 'strong') - (a.level === 'strong'));

  const score = Math.round(100 - penalty);
  const verdict = score >= 90 ? 'Position bleibt stabil' : score >= 75 ? 'Leichte Veränderung' : score >= 55 ? 'Deutliche Ermüdung' : 'Position zerfällt';
  return {
    ok: true, score, verdict, tracks, findings,
    minutes: windows.length ? windows[windows.length - 1].minute : 0,
    validMinutes: valid.length,
  };
}
