import test from 'node:test';
import assert from 'node:assert/strict';
import { angleAt, analyzeSession } from '../js/analysis.js';
import { evaluate } from '../js/evaluate.js';
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
  const lowItem = evaluate(low, 'sport').find((i) => i.key === 'kneeExt');
  assert.notEqual(lowItem.status, 'ok');
  assert.match(lowItem.tip, /höher/);

  const high = analyzeSession(syntheticSession({ saddleHeight: 82 }));
  const highItem = evaluate(high, 'sport').find((i) => i.key === 'kneeExt');
  assert.notEqual(highItem.status, 'ok');
  assert.match(highItem.tip, /tiefer/);
});

test('Fahrstil ändert die Bewertung des Oberkörpers', () => {
  const r = analyzeSession(syntheticSession({ torsoDeg: 55 }));
  assert.equal(evaluate(r, 'komfort').find((i) => i.key === 'torso').status, 'ok');
  assert.equal(evaluate(r, 'rennen').find((i) => i.key === 'torso').status, 'bad');
});

test('ohne Tretbewegung gibt es eine verständliche Fehlermeldung', () => {
  const s = syntheticSession({ crank: 0.2 });
  const r = analyzeSession(s);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Tretbewegung/);
});
