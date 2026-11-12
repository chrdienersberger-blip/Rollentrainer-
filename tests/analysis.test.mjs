import test from 'node:test';
import assert from 'node:assert/strict';
import { angleAt, analyzeSession } from '../js/analysis.js';
import { evaluate, saddleFromInseam } from '../js/evaluate.js';
import { findBike, BRANDS, CATEGORIES } from '../js/bikes.js';
import { syntheticSession } from '../js/demo.js';

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
