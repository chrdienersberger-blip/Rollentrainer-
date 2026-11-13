import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIndoorBikeData, parseCyclingPower, parseHeartRate, cmdTargetPower, cmdSimulation } from '../js/ftms.js';
import { WORKOUTS, ROUTES, workoutDuration, targetAt, gradeAt, elevationAt, routeLength, routeClimb, stepSpeed, summarize, toTcx, PLAN, planItem, prepFor, powerZone, hrZone, expectedHrZone, cadenceRange, powerRange, judge } from '../js/workouts.js';

const dv = (bytes) => new DataView(Uint8Array.from(bytes).buffer);

test('FTMS: Indoor Bike Data mit Tempo, Trittfrequenz, Leistung und Puls', () => {
  // Flags 0x0244: Trittfrequenz, Leistung, Puls; Tempo ist ohne „More Data“ immer dabei
  const d = parseIndoorBikeData(dv([0x44, 0x02, 0x10, 0x0e, 0xb4, 0x00, 0xfa, 0x00, 0x8c]));
  assert.equal(d.speedKmh, 36);     // 0x0e10 = 3600 → 36,00 km/h
  assert.equal(d.cadence, 90);      // 0x00b4 = 180 → 90 U/min
  assert.equal(d.power, 250);
  assert.equal(d.hr, 140);
  // mit Distanz und Widerstandsstufe davor
  const e = parseIndoorBikeData(dv([0x74, 0x00, 0, 0, 0xa0, 0x00, 0x10, 0x27, 0x00, 0x05, 0x00, 0x2c, 0x01]));
  assert.equal(e.cadence, 80);
  assert.equal(e.distance, 10000);
  assert.equal(e.power, 300);
});

test('Leistungsmesser: Leistung und Trittfrequenz aus Kurbelumdrehungen', () => {
  const a = parseCyclingPower(dv([0x20, 0x00, 0xc8, 0x00, 0x0a, 0x00, 0x00, 0x04]));
  assert.equal(a.power, 200);
  assert.deepEqual(a.crank, { revs: 10, time: 1024 });
  const b = parseCyclingPower(dv([0x20, 0x00, 0xd2, 0x00, 0x0c, 0x00, 0x00, 0x09]), a.crank); // 2 Umdrehungen in 1,25 s
  assert.equal(b.cadence, 96);
  assert.equal(parseHeartRate(dv([0x00, 0x91])), 145);
  assert.equal(parseHeartRate(dv([0x01, 0x2c, 0x01])), 300);
});

test('Befehle an den Trainer', () => {
  assert.deepEqual([...cmdTargetPower(250)], [0x05, 0xfa, 0x00]);
  assert.deepEqual([...cmdSimulation(4.5)], [0x11, 0x00, 0x00, 0xc2, 0x01, 40, 51]);
  assert.deepEqual([...cmdSimulation(-2)].slice(3, 5), [0x38, 0xff]);
});

test('Workouts: Dauer, Zielleistung, Rampen', () => {
  for (const w of WORKOUTS) {
    assert.ok(workoutDuration(w) >= 20 * 60 && workoutDuration(w) <= 75 * 60, w.id);
    assert.ok(targetAt(w, 0, 200).watts > 0);
    assert.equal(targetAt(w, workoutDuration(w), 200), null);
  }
  const ss = WORKOUTS.find((w) => w.id === 'sweetspot');
  assert.equal(targetAt(ss, 0, 200).watts, 100);            // Rampe 50 → 75 %
  assert.equal(targetAt(ss, 300, 200).watts, 125);
  assert.equal(targetAt(ss, 600, 200).watts, 180);          // erster Block 90 %
  assert.equal(targetAt(ss, 600, 250).watts, 225);
  assert.equal(targetAt(ss, 610, 200).remaining, 590);
});

test('Strecken: Steigung, Höhe, Fahrphysik', () => {
  const pass = ROUTES.find((r) => r.id === 'pass');
  assert.equal(routeLength(pass), 9000);
  assert.equal(Math.round(routeClimb(pass)), 620);
  assert.equal(gradeAt(pass, 500), 5);
  assert.equal(elevationAt(pass, 500), 805);
  for (const r of ROUTES) for (let d = 0; d <= routeLength(r); d += 250) assert.ok(Math.abs(gradeAt(r, d)) <= 15);
  // 200 W in der Ebene: gut 30 km/h; am 7-%-Berg deutlich langsamer
  let flat = 0, climb = 0;
  for (let i = 0; i < 300; i++) { flat = stepSpeed(flat, 200, 0, 83); climb = stepSpeed(climb, 200, 7, 83); }
  assert.ok(flat * 3.6 > 30 && flat * 3.6 < 36, `eben ${flat * 3.6}`);
  assert.ok(climb * 3.6 > 10 && climb * 3.6 < 14, `bergauf ${climb * 3.6}`);
  assert.equal(stepSpeed(0, 0, 0, 83), 0);
});

test('Auswertung und TCX-Export', () => {
  const steady = Array.from({ length: 3600 }, (_, i) => ({ power: 200, cad: 90, hr: 140, dist: i * 9, speed: 32 }));
  const s = summarize(steady, 200);
  assert.equal(s.avgPower, 200);
  assert.equal(s.np, 200);
  assert.equal(s.tss, 100);          // eine Stunde genau an der FTP
  assert.equal(s.kj, 720);
  assert.equal(s.avgCad, 90);
  const varied = steady.map((x, i) => ({ ...x, power: i % 120 < 60 ? 100 : 300 }));
  assert.ok(summarize(varied, 200).np > 215);   // ungleichmäßig ist härter als der Schnitt
  const tcx = toTcx(Date.UTC(2026, 0, 1), steady.slice(0, 3));
  assert.match(tcx, /<ns3:Watts>200<\/ns3:Watts>/);
  assert.match(tcx, /<Id>2026-01-01T00:00:00.000Z<\/Id>/);
  assert.equal(tcx.match(/<Trackpoint>/g).length, 3);
});

test('Einsteigerplan verweist nur auf vorhandene Einheiten und beginnt leicht', () => {
  assert.equal(PLAN.length, 4);
  for (const week of PLAN) {
    assert.equal(week.items.length, 3);
    for (const [kind, id] of week.items) assert.ok(planItem(kind, id), `${kind} ${id}`);
  }
  const first = planItem(...PLAN[0].items[0]);
  assert.equal(workoutDuration(first), 20 * 60);
  assert.ok(Math.max(...first.segs.map((s) => Math.max(s[1], s[2]))) <= 60);
});

test('Vorbereitung richtet sich nach Härte, Dauer und Körpergewicht', () => {
  const w = (id) => WORKOUTS.find((x) => x.id === id);
  const easy = prepFor('workout', w('first'), 75);
  assert.equal(easy.level, 'easy');
  assert.match(easy.during, /500 ml/);
  const mod = prepFor('workout', w('endurance'), 80);
  assert.equal(mod.level, 'moderate');
  assert.match(mod.before, /etwa 80 g Kohlenhydraten/);
  const hard = prepFor('workout', w('vo2'), 70);
  assert.equal(hard.level, 'hard');
  assert.match(hard.before, /105–140 g Kohlenhydrate/);
  assert.match(hard.after, /Eiweiß/);
  assert.match(prepFor('workout', w('vo2'), 90).before, /135–180 g/);
  assert.equal(prepFor('route', ROUTES.find((r) => r.id === 'pass'), 75).level, 'hard');
  assert.equal(prepFor('route', ROUTES.find((r) => r.id === 'flat'), 75).level, 'easy');
});

test('Zonen: Leistung, Herzfrequenz, Trittfrequenz', () => {
  assert.equal(powerZone(100, 200).z, 1);
  assert.equal(powerZone(150, 200).z, 2);
  assert.equal(powerZone(180, 200).z, 3);
  assert.equal(powerZone(200, 200).name, 'Schwelle');
  assert.equal(powerZone(236, 200).z, 5);
  assert.equal(powerZone(400, 200).z, 7);
  assert.equal(hrZone(100, 185).z, 1);
  assert.equal(hrZone(125, 185).z, 2);
  assert.equal(hrZone(160, 185).z, 4);
  assert.equal(hrZone(180, 185).z, 5);
  assert.equal(expectedHrZone(60), 2);
  assert.equal(expectedHrZone(98), 4);
  assert.equal(expectedHrZone(118), 5);
  const cad = WORKOUTS.find((w) => w.id === 'cadence');
  assert.deepEqual(cadenceRange(cad, 1), [75, 85]);
  assert.deepEqual(cadenceRange(cad, 5), [95, 105]);
  assert.deepEqual(cadenceRange(cad, 0), [80, 100]);
  assert.deepEqual(powerRange(200), [190, 210]);
  assert.deepEqual(powerRange(100), [90, 110]);
  assert.equal(judge(185, [190, 210]), 'low');
  assert.equal(judge(200, [190, 210]), 'ok');
  assert.equal(judge(230, [190, 210]), 'high');
});
