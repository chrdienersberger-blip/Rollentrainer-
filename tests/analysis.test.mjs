import test from 'node:test';
import assert from 'node:assert/strict';
import { angleAt, analyzeSession } from '../js/analysis.js';
import { evaluate, saddleFromInseam, statusOf } from '../js/evaluate.js';
import { clipStatuses, share, frameAt } from '../js/overlay.js';
import { findBike, BRANDS, CATEGORIES } from '../js/bikes.js';
import { syntheticSession, syntheticFatigueWindows } from '../js/demo.js';
import { summarizeFatigue, windowFromResult } from '../js/fatigue.js';

// Erwartete maximale Kniestreckung des Gelenkmodells direkt aus der Geometrie
function expectedKneeExt(saddleHeight, thigh = 42, shank = 43, crank = 17.25) {
  const rad = (d) => (d * Math.PI) / 180;
  const hip = { x: -saddleHeight * Math.cos(rad(73)), y: saddleHeight * Math.sin(rad(73)) };
  let dMax = 0;
  for (let a = 0; a < 360; a += 0.25) {
    const ankle = { x: crank * Math.sin(rad(a)) - 11, y: crank * Math.cos(rad(a)) + 8 };
    dMax = Math.max(dMax, Math.hypot(hip.x - ankle.x, hip.y - ankle.y));
  }
  return (Math.acos((thigh ** 2 + shank ** 2 - dMax ** 2) / (2 * thigh * shank)) * 180) / Math.PI;
}

test('angleAt', () => {
  assert.equal(Math.round(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })), 90);
  assert.equal(Math.round(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: -1, y: 0 })), 180);
});

test('erkennt Seite, Trittfrequenz und Winkel', () => {
  const r = analyzeSession(syntheticSession({ saddleHeight: 76, cadence: 88, torsoDeg: 45 }), { heightCm: 175 });
  assert.ok(r.ok, r.reason);
  assert.equal(r.side, 'right');
  assert.ok(Math.abs(r.cadence - 88) <= 2, `Trittfrequenz ${r.cadence}`);
  assert.ok(Math.abs(r.metrics.kneeExt - expectedKneeExt(76)) < 2.5, `Knie ${r.metrics.kneeExt} vs ${expectedKneeExt(76)}`);
  assert.ok(Math.abs(r.metrics.torso - 45) < 1.5, `Oberkörper ${r.metrics.torso}`);
  assert.ok(Math.abs(r.metrics.kops) < 6, `Knielot ${r.metrics.kops}`);
});

test('niedriger Sattel → Empfehlung höher, hoher Sattel → tiefer', () => {
  const low = analyzeSession(syntheticSession({ saddleHeight: 70 }));
  const lowItem = evaluate(low, 'sport').items.find((i) => i.key === 'kneeExt');
  assert.notEqual(lowItem.status, 'ok');
  assert.match(lowItem.tip, /höher/);

  const high = analyzeSession(syntheticSession({ saddleHeight: 82 }));
  const highItem = evaluate(high, 'sport').items.find((i) => i.key === 'kneeExt');
  assert.notEqual(highItem.status, 'ok');
  assert.match(highItem.tip, /tiefer/);
});

test('Fahrstil ändert die Bewertung des Oberkörpers', () => {
  const r = analyzeSession(syntheticSession({ torsoDeg: 55 }));
  assert.equal(evaluate(r, 'komfort').items.find((i) => i.key === 'torso').status, 'ok');
  assert.equal(evaluate(r, 'rennen').items.find((i) => i.key === 'torso').status, 'bad');
});

test('ohne Tretbewegung gibt es eine verständliche Fehlermeldung', () => {
  const s = syntheticSession({ crank: 0.2 });
  const r = analyzeSession(s);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Tretbewegung/);
});

test('Punktzahl sinkt mit schlechterer Position, wichtigste Anpassung wird benannt', () => {
  const good = evaluate(analyzeSession(syntheticSession({ saddleHeight: 74.5 })), 'sport');
  const bad = evaluate(analyzeSession(syntheticSession({ saddleHeight: 68 })), 'sport');
  assert.ok(good.score > bad.score, `${good.score} vs ${bad.score}`);
  assert.equal(bad.top.key, 'kneeExt');
  assert.match(bad.top.action, /höher/);
});

test('Fahrradauswahl: Kategorie, integriertes Cockpit, Fallback', () => {
  for (const list of Object.values(BRANDS)) for (const x of list) assert.ok(CATEGORIES[x.cat], x.model);
  const aeroad = findBike('Canyon|Aeroad');
  assert.equal(aeroad.name, 'Canyon Aeroad');
  assert.equal(CATEGORIES[aeroad.cat].style, 'rennen');
  assert.equal(findBike('other|gravel').cat, 'gravel');
  assert.equal(findBike('gibt|esnicht').cat, 'allround');
  const r = analyzeSession(syntheticSession({ torsoDeg: 20 }));
  const tip = evaluate(r, 'rennen', aeroad).items.find((i) => i.key === 'torso').tip;
  assert.match(tip, /Canyon Aeroad/);
});

test('Kniekurve beginnt am oberen Totpunkt, Sattelhöhe aus Schrittlänge', () => {
  const r = analyzeSession(syntheticSession());
  assert.equal(r.kneeCurve.length, 24);
  assert.equal(Math.min(...r.kneeCurve), r.kneeCurve[0]);
  assert.ok(r.extras.hipBob < 1);
  assert.equal(saddleFromInseam(85), 75.1);
  assert.equal(saddleFromInseam(0), null);
});

test('Ermüdungs-Check: stabiler Verlauf ohne Befund, Drift wird erkannt und datiert', () => {
  const stable = Array.from({ length: 20 }, (_, i) => ({ minute: i + 1, ok: true, torso: 42 + (i % 2) * 0.4, kneeExt: 145, hipBob: 1, elbow: 155, cadence: 90 }));
  const s = summarizeFatigue(stable);
  assert.ok(s.ok);
  assert.equal(s.findings.length, 0);
  assert.ok(s.score >= 95, `Score ${s.score}`);

  const f = summarizeFatigue(syntheticFatigueWindows(40));
  assert.ok(f.ok);
  assert.ok(f.score < 70, `Score ${f.score}`);
  const torso = f.findings.find((x) => x.key === 'torso');
  assert.match(torso.title, /richtet sich auf/);
  assert.ok(torso.drift > 4);
  assert.ok(torso.onset >= 20 && torso.onset <= 36, `Beginn ${torso.onset}`);
  assert.match(f.findings.find((x) => x.key === 'kneeExt').title, /weniger/);
  assert.ok(f.findings.find((x) => x.key === 'hipBob'));
  assert.equal(f.validMinutes, 39);
});

test('Ermüdungs-Check: zu wenige Minuten, Fenster aus Messergebnis', () => {
  assert.equal(summarizeFatigue(syntheticFatigueWindows(4)).ok, false);
  const w = windowFromResult(3, analyzeSession(syntheticSession()));
  assert.equal(w.minute, 3);
  assert.ok(w.ok && w.torso > 40 && w.cadence > 80 && w.hipBob >= 0);
  assert.equal(windowFromResult(4, { ok: false }).ok, false);
});

test('Video-Umrandung: Status je Bild und Bereich', () => {
  const toFrames = (samples) => samples.map((s) => ({
    t: Math.round(s.t), a: 1, c: 1,
    p: Object.fromEntries(Object.entries(s.right).map(([k, v]) => [k, [Math.round(v.x), Math.round(v.y)]])),
  }));
  assert.equal(statusOf('kneeExt', 145, 'sport'), 'ok');
  assert.equal(statusOf('kneeExt', 130, 'sport'), 'bad');
  assert.equal(statusOf('torso', 44, 'sport'), 'ok');

  const low = toFrames(syntheticSession({ saddleHeight: 68, torsoDeg: 44, seconds: 6 }));
  const st = clipStatuses(low, 'sport', 88);
  assert.equal(st.leg.length, low.length);
  assert.ok(share(st.leg).bad > 0.95, JSON.stringify(share(st.leg)));   // Sattel deutlich zu tief
  assert.ok(share(st.torso).ok > 0.95, JSON.stringify(share(st.torso)));
  assert.ok(st.arm.every(Boolean));

  const good = clipStatuses(toFrames(syntheticSession({ saddleHeight: 74.5, seconds: 6 })), 'sport', 88);
  assert.ok(share(good.leg).ok > 0.95, JSON.stringify(share(good.leg)));
  assert.equal(frameAt(low, 0), 0);
  assert.equal(frameAt(low, 1e9), low.length - 1);
  assert.equal(low[frameAt(low, 1010)].t, 1000);
});
