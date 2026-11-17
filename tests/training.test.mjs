import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIndoorBikeData, parseCyclingPower, parseHeartRate, cmdTargetPower, cmdSimulation } from '../js/ftms.js';
import { WORKOUTS, ROUTES, workoutDuration, targetAt, gradeAt, elevationAt, routeLength, routeClimb, stepSpeed, summarize, toTcx, PLAN, planItem, prepFor, powerZone, hrZone, expectedHrZone, cadenceRange, powerRange, judge, routeFromTrack, youtubeId, videoRate } from '../js/workouts.js';

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

test('Trainer: Verbindung, Messwerte und Steuerbefehle über einen nachgestellten Funkweg', async () => {
  const { Trainer } = await import('../js/trainer.js');
  const sent = [], listeners = new Map();
  let dropped = null;
  const fake = {
    pick: async ({ all, heartRate } = {}) => ({ name: heartRate ? 'TICKR' : all ? 'Irgendwas' : 'KICKR CORE 1234' }),
    open: async (h, onDisconnect) => { dropped = onDisconnect; },
    listen: async (h, service, characteristic, cb) => { listeners.set(`${service.toString(16)}/${characteristic.toString(16)}`, cb); },
    send: async (h, service, characteristic, bytes) => { sent.push([...bytes]); },
    close: () => {},
  };
  let changes = 0;
  const t = new Trainer(() => changes++, fake);
  await t.connectBluetooth();
  assert.equal(t.connected, true);
  assert.equal(t.name, 'KICKR CORE 1234');
  assert.equal(t.controllable, true);
  assert.deepEqual(sent, [[0x00], [0x07]]);                 // Kontrolle anfordern, starten
  // Trainer meldet 36 km/h, 90 U/min, 250 W
  listeners.get('1826/2ad2')(new DataView(Uint8Array.from([0x44, 0x00, 0x10, 0x0e, 0xb4, 0x00, 0xfa, 0x00]).buffer));
  assert.equal(t.data.power, 250);
  assert.equal(t.data.cadence, 90);
  t.setTargetPower(180); t.setGrade(3);
  await t.queue;
  assert.deepEqual(sent[2], [0x05, 180, 0]);
  assert.equal(sent[3][0], 0x11);
  await t.connectHeartRate();
  listeners.get('180d/2a37')(new DataView(Uint8Array.from([0x00, 142]).buffer));
  assert.equal(t.hrName, 'TICKR');
  assert.equal(t.data.hr, 142);
  assert.ok(changes > 3);
});

test('Trainer: ohne FTMS als reiner Leistungsmesser, Abbruch der Verbindung', async () => {
  const { Trainer } = await import('../js/trainer.js');
  const listeners = new Map();
  let dropped = null;
  const fake = {
    pick: async () => ({ name: 'Powermeter' }),
    open: async (h, onDisconnect) => { dropped = onDisconnect; },
    listen: async (h, service, characteristic, cb) => {
      if (service === 0x1826) { const e = new Error('kein Dienst'); e.name = 'NotFoundError'; throw e; }
      listeners.set(characteristic, cb);
    },
    send: async () => { throw new Error('darf nicht senden'); },
    close: () => {},
  };
  const t = new Trainer(() => {}, fake);
  await t.connectBluetooth();
  assert.equal(t.connected, true);
  assert.equal(t.controllable, false);
  assert.match(t.log.join(' '), /FTMS: nein/);
  listeners.get(0x2a63)(new DataView(Uint8Array.from([0x00, 0x00, 0xc8, 0x00]).buffer));
  assert.equal(t.data.power, 200);
  t.setTargetPower(150);                                    // ohne Steuerung: kein Fehler, kein Senden
  await t.queue;
  dropped();
  assert.equal(t.connected, false);
});

test('Bekannte Anstiege stimmen in Länge und Höhenmetern mit den üblichen Angaben', () => {
  const r = (id) => ROUTES.find((x) => x.id === id);
  const check = (id, km, up) => {
    assert.ok(Math.abs(routeLength(r(id)) / 1000 - km) < 0.11, `${id} Länge ${routeLength(r(id))}`);
    assert.ok(Math.abs(routeClimb(r(id)) - up) < 15, `${id} Höhenmeter ${routeClimb(r(id))}`);
    assert.equal(prepFor('route', r(id), 75).level, 'hard');
  };
  check('sacalobra', 9.4, 668);
  check('alpedhuez', 13.8, 1118);
  check('ventoux', 21.3, 1610);
  assert.ok(gradeAt(r('alpedhuez'), 500) > 10);
  assert.ok(gradeAt(r('ventoux'), 2000) < 5);
});

test('GPX: Strecke aus Trackpunkten', () => {
  // 5 km genau nach Norden, gleichmäßig 250 m bergauf, mit etwas Höhenrauschen
  const pts = Array.from({ length: 501 }, (_, i) => ({ lat: 46 + (i * 10) / 111195, lon: 8, ele: 500 + i * 0.5 + (i % 2 ? 1.5 : -1.5) }));
  const route = routeFromTrack('Testberg', pts);
  assert.ok(Math.abs(routeLength(route) - 5000) < 30, `Länge ${routeLength(route)}`);
  assert.ok(Math.abs(routeClimb(route) - 250) < 15, `Höhenmeter ${routeClimb(route)}`);
  assert.ok(Math.abs(gradeAt(route, 2500) - 5) < 0.6, `Steigung ${gradeAt(route, 2500)}`);
  assert.equal(route.track.length, route.points.length);
  assert.ok(route.track.length <= 402);
  assert.equal(route.hasEle, true);
  assert.equal(routeFromTrack('zu kurz', pts.slice(0, 20)), null);
  const flat = routeFromTrack('ohne Höhe', pts.map(({ lat, lon }) => ({ lat, lon })));
  assert.equal(flat.hasEle, false);
  assert.equal(routeClimb(flat), 0);
});

test('Video: YouTube-Kennung und Abspieltempo', () => {
  assert.equal(youtubeId('https://www.youtube.com/watch?v=abcdefghijk'), 'abcdefghijk');
  assert.equal(youtubeId('https://youtu.be/abcdefghijk?t=30'), 'abcdefghijk');
  assert.equal(youtubeId('https://www.youtube.com/watch?list=x&v=ABC_def-123'), 'ABC_def-123');
  assert.equal(youtubeId('https://www.youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
  assert.equal(youtubeId('https://example.com/video.mp4'), null);
  assert.equal(videoRate(0), 0);
  assert.equal(videoRate(25), 1);
  assert.equal(videoRate(12), 0.5);
  assert.equal(videoRate(9), 0.25);
  assert.equal(videoRate(80), 2);
});
