// Trainingsbereich: Trainer verbinden, Workouts (ERG) und Strecken (Steigungssimulation) fahren.

import { Trainer, bluetoothAvailable } from './trainer.js?v=12';
import { WORKOUTS, ROUTES, workoutDuration, routeLength, routeClimb, targetAt, gradeAt, elevationAt, stepSpeed, summarize, toTcx, PLAN, planItem, prepFor } from './workouts.js?v=12';

const PREFS_KEY = 'rollentrainer.training.v1', RIDES_KEY = 'rollentrainer.rides.v1';
const SVGNS = 'http://www.w3.org/2000/svg';
const INK = '#111110', MUTED = '#77736b', LINE = '#d6d1c6', ACCENT = '#a8553a';
const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const svgEl = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
};
const de = (v, digits = 0) => Number(v).toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const clock = (s) => {
  const t = Math.max(0, Math.round(s)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(t % 60).padStart(2, '0')}`;
};
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
};

export function initTraining(root) {
  const prefs = { ftp: 200, weight: 75, tab: 'workouts', planDone: {}, ...store.get(PREFS_KEY, {}) };
  const savePrefs = () => store.set(PREFS_KEY, prefs);
  const ftp = () => Math.min(500, Math.max(80, Number(prefs.ftp) || 200));
  const mass = () => Math.min(150, Math.max(40, Number(prefs.weight) || 75)) + 8; // plus Rad
  let ride = null, liveHook = null, statusHook = null, wakeLock = null;
  const recent = [];                                    // letzte Leistungswerte für das 3-s-Mittel
  const trainer = new Trainer((dataOnly) => {
    if (dataOnly) {
      recent.push(trainer.data.power || 0);
      if (recent.length > 3) recent.shift();
      liveHook?.();
    } else if (ride) {
      liveHook?.();
    } else {
      statusHook?.();
      liveHook?.();
    }
  });
  const power3s = () => (recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : 0);

  const header = (tag) => {
    const h = el('header', 'brand');
    h.append(el('span', 'brandname', 'Sitzcheck'), el('span', 'brandtag', tag));
    return h;
  };

  // ---------- Profil-Grafik (Workout oder Strecke) ----------
  function profile(kind, def, { W = 340, H = 70, big = false } = {}) {
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'profile', role: 'img',
      'aria-label': kind === 'workout' ? `Verlauf der Zielleistung: ${def.name}` : `Höhenprofil: ${def.name}` });
    const B = big ? 16 : 2, T = big ? 12 : 2;
    let x, y, total;
    if (kind === 'workout') {
      total = workoutDuration(def);
      const top = Math.max(130, ...def.segs.map((s) => Math.max(s[1], s[2]))) + 5;
      x = (t) => (t / total) * W;
      y = (pct) => T + (1 - pct / top) * (H - T - B);
      let t = 0;
      for (const [dur, from, to] of def.segs) {
        const mid = (from + to) / 2;
        svgEl('polygon', {
          points: `${x(t).toFixed(1)},${H - B} ${x(t).toFixed(1)},${y(from).toFixed(1)} ${x(t + dur).toFixed(1)},${y(to).toFixed(1)} ${x(t + dur).toFixed(1)},${H - B}`,
          fill: INK, opacity: (0.18 + Math.min(1, mid / 125) * 0.72).toFixed(2), stroke: '#f3f1ec', 'stroke-width': 0.6,
        }, svg);
        t += dur;
      }
      if (big) {
        svgEl('line', { x1: 0, x2: W, y1: y(100), y2: y(100), stroke: MUTED, 'stroke-width': 0.7, 'stroke-dasharray': '2 3' }, svg);
        const t100 = svgEl('text', { x: 3, y: y(100) - 3, fill: MUTED, 'font-size': 8, 'font-family': FONT }, svg);
        t100.textContent = 'FTP';
      }
    } else {
      total = routeLength(def);
      const elev = def.points.map((p) => p[1]), lo = Math.min(...elev), hi = Math.max(...elev, lo + 60);
      x = (d) => (d / total) * W;
      y = (e) => T + (1 - (e - lo) / (hi - lo)) * (H - T - B - 4);
      svgEl('path', {
        d: `M0,${H - B} ` + def.points.map((p) => `L${x(p[0] * 1000).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ') + ` L${W},${H - B} Z`,
        fill: INK, opacity: 0.2,
      }, svg);
      svgEl('polyline', { points: def.points.map((p) => `${x(p[0] * 1000).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' '), fill: 'none', stroke: INK, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, svg);
    }
    svgEl('line', { x1: 0, x2: W, y1: H - B, y2: H - B, stroke: INK, 'stroke-width': 0.8 }, svg);
    return { svg, x, y, W, H, B, T, total };
  }

  // ---------- Startseite ----------
  function home() {
    ride = null; liveHook = null;
    document.body.classList.remove('busy');
    root.replaceChildren(header('Training'));
    const head = el('div', 'pagehead');
    head.append(el('h1', null, 'Training auf dem Rollentrainer'),
      el('p', null, 'Verbinde deinen Smart Trainer und fahre strukturierte Workouts oder eine Strecke mit simulierter Steigung.'));
    root.append(head);

    // Trainer
    const dev = el('section', 'card');
    const step = el('div', 'step');
    step.append(el('span', null, '1'), el('h2', null, 'Dein Trainer'));
    const status = el('div', 'devstatus'), btns = el('div', 'row wrap'), hint = el('p', 'hint');
    // Live-Werte, sobald ein Gerät verbunden ist – auch ohne laufende Einheit
    const live = el('div', 'ridetiles livetiles');
    const liveVal = {};
    for (const [key, label] of [['power', 'Watt'], ['cadence', 'Trittfrequenz'], ['hr', 'Herzfrequenz']]) {
      const t = el('div', 'rt'), v = el('b', null, '–');
      t.append(v, el('small', null, label));
      live.append(t);
      liveVal[key] = v;
    }
    liveHook = () => {
      const d = trainer.data;
      liveVal.power.textContent = trainer.connected ? de(power3s()) : '–';
      liveVal.cadence.textContent = trainer.connected && d.cadence ? de(d.cadence) : '–';
      liveVal.hr.textContent = d.hr ? de(d.hr) : '–';
    };
    dev.append(step, status, live, btns, hint);
    root.append(dev);
    const run = async (fn) => {
      hint.textContent = '';
      try { await fn(); } catch (err) {
        if (err?.name !== 'NotFoundError') hint.textContent = 'Die Verbindung hat nicht geklappt. Ist der Trainer eingeschaltet und mit keiner anderen App verbunden?';
      }
    };
    statusHook = () => {
      status.replaceChildren();
      const dot = el('span', `dot ${trainer.connected ? 'on' : ''}`);
      const txt = el('div');
      txt.append(el('b', null, trainer.connected ? trainer.name : 'Nicht verbunden'),
        el('small', null, !trainer.connected ? 'Kickr, Tacx, Elite und andere Trainer mit Bluetooth (FTMS)'
          : trainer.controllable ? 'Widerstand wird automatisch gesteuert' : 'Liefert nur Messwerte – Widerstand von Hand einstellen'));
      status.append(dot, txt);
      if (trainer.hrName) status.append(el('small', 'hrname', `Herzfrequenz: ${trainer.hrName}`));
      live.hidden = !trainer.connected && !trainer.hrName;
      liveHook?.();
      btns.replaceChildren();
      const b = (label, cls, fn) => { const x = el('button', cls, label); x.type = 'button'; x.onclick = fn; btns.append(x); return x; };
      if (trainer.connected) {
        b('Trennen', 'secondary', () => trainer.disconnect());
      } else {
        const c = b('Trainer verbinden', 'primary', () => run(() => trainer.connectBluetooth()));
        c.disabled = !bluetoothAvailable();
        b('Demo-Trainer', 'secondary', () => trainer.connectDemo());
      }
      if (!trainer.hrName) {
        const h = b('Herzfrequenz-Sensor verbinden', 'secondary', () => run(() => trainer.connectHeartRate()));
        h.disabled = !bluetoothAvailable();
      }
      if (!bluetoothAvailable()) {
        hint.textContent = 'Dieser Browser kann keine Bluetooth-Geräte ansprechen. Das geht mit Chrome oder Edge auf Android, Windows und Mac. Auf iPhone und iPad funktioniert es weder in Safari noch in Chrome, weil dort alle Browser dieselbe Technik ohne Web-Bluetooth nutzen – es braucht einen Spezial-Browser mit dieser Funktion (z. B. Bluefy). Zum Ausprobieren gibt es den Demo-Trainer.';
      }
      for (const s of root.querySelectorAll('.wkstart')) s.disabled = !trainer.connected;
      startHint.hidden = trainer.connected;
    };

    // Werte
    const you = el('section', 'card');
    const step2 = el('div', 'step');
    step2.append(el('span', null, '2'), el('h2', null, 'Deine Werte'));
    const grid = el('div', 'grid2');
    const field = (label, key, unit, min, max) => {
      const l = el('label', null, label), f = el('span', 'field'), i = el('input');
      i.type = 'number'; i.inputMode = 'numeric'; i.min = min; i.max = max; i.value = prefs[key];
      i.oninput = () => { prefs[key] = i.value; savePrefs(); renderList(); renderPlan(); };
      i.dataset.key = key;
      f.append(i, el('i', null, unit));
      l.append(f);
      return l;
    };
    grid.append(field('FTP (Schwellenleistung)', 'ftp', 'W', 80, 500), field('Körpergewicht', 'weight', 'kg', 40, 150));
    const guess = el('button', 'textbtn', 'FTP für Einsteiger schätzen');
    guess.type = 'button';
    guess.onclick = () => {
      // grober Startwert: rund 2 Watt je Kilogramm
      prefs.ftp = Math.round(((Number(prefs.weight) || 75) * 2) / 5) * 5;
      savePrefs();
      you.querySelector('input[data-key=ftp]').value = prefs.ftp;
      renderList(); renderPlan();
    };
    you.append(step2, grid, el('p', 'hint', 'Die Workouts richten sich nach deiner FTP – der Leistung, die du etwa eine Stunde halten kannst. Kennst du sie nicht, nimm den Schätzwert und fahre später den Rampentest.'), guess);
    root.append(you);

    // Einsteigerplan
    const planCard = el('section', 'card');
    planCard.id = 'plan';
    root.append(planCard);
    function renderPlan() {
      const stepP = el('div', 'step');
      stepP.append(el('span', null, '3'), el('h2', null, 'Dein Einsteigerplan'));
      const all = PLAN.flatMap((wk, w) => wk.items.map((it, i) => `${w}-${i}`));
      const doneN = all.filter((k) => prefs.planDone[k]).length, next = all.find((k) => !prefs.planDone[k]);
      const intro = el('p', 'hint', doneN === all.length ? 'Geschafft – alle zwölf Einheiten sind gefahren. Such dir jetzt unten frei aus, was du fahren möchtest.'
        : `Vier Wochen, drei Einheiten je Woche, mit mindestens einem Ruhetag dazwischen. ${doneN} von ${all.length} erledigt.`);
      planCard.replaceChildren(stepP, intro);
      PLAN.forEach((wk, w) => {
        const box = el('div', 'week');
        box.append(el('b', null, wk.title), el('small', null, wk.text));
        wk.items.forEach(([kind, id], i) => {
          const key = `${w}-${i}`, def = planItem(kind, id), row = el('div', `planrow${prefs.planDone[key] ? ' done' : ''}${key === next ? ' next' : ''}`);
          const meta = kind === 'workout' ? `${Math.round(workoutDuration(def) / 60)} min · ${def.focus}` : `${de(routeLength(def) / 1000, 1)} km · Strecke`;
          const left = el('div');
          left.append(el('span', null, def.name), el('small', null, meta));
          row.append(el('i', 'tick', prefs.planDone[key] ? '✓' : String(i + 1)), left);
          if (key === next) {
            const go = el('button', 'wkstart', 'Start');
            go.type = 'button';
            go.disabled = !trainer.connected;
            go.onclick = () => startRide(kind, def, key);
            row.append(go);
          }
          box.append(row);
          if (key === next) box.append(prepBlock(kind, def, true));
        });
        planCard.append(box);
      });
    }
    /** Aufklappbarer Block „Vorbereitung & Verpflegung“ für eine Einheit. */
    function prepBlock(kind, def, open = false) {
      const p = prepFor(kind, def, prefs.weight), d = el('details', 'prep');
      d.open = open;
      d.append(el('summary', null, `Vorbereitung & Verpflegung · ${p.label}`));
      for (const [k, v] of [['Davor', p.before], ['Währenddessen', p.during], ['Danach', p.after], ['Bereitlegen', p.kit]]) {
        const r = el('div', 'preprow');
        r.append(el('b', null, k), el('p', null, v));
        d.append(r);
      }
      d.append(el('p', 'prepnote', 'Allgemeine Richtwerte, auf dein Gewicht gerechnet – keine individuelle Ernährungsberatung.'));
      return d;
    }

    // Auswahl
    const pick = el('section', 'card');
    const step3 = el('div', 'step');
    step3.append(el('span', null, '4'), el('h2', null, 'Alle Einheiten'));
    const tabs = el('div', 'seg'), list = el('div', 'wklist'), startHint = el('p', 'hint', 'Verbinde zuerst deinen Trainer oder wähle den Demo-Trainer.');
    for (const [key, label] of [['workouts', 'Workouts'], ['routes', 'Strecken']]) {
      const t = el('button', null, label);
      t.type = 'button';
      t.setAttribute('aria-pressed', String(prefs.tab === key));
      t.onclick = () => { prefs.tab = key; savePrefs(); for (const x of tabs.children) x.setAttribute('aria-pressed', String(x === t)); renderList(); };
      tabs.append(t);
    }
    pick.append(step3, tabs, startHint, list);
    root.append(pick);
    function renderList() {
      list.replaceChildren();
      const items = prefs.tab === 'workouts' ? WORKOUTS : ROUTES;
      for (const def of items) {
        const kind = prefs.tab === 'workouts' ? 'workout' : 'route';
        const row = el('div', 'wk'), top = el('div', 'wkhead'), left = el('div');
        const meta = kind === 'workout'
          ? `${Math.round(workoutDuration(def) / 60)} min · ${def.focus} · bis ${de((Math.max(...def.segs.map((s) => Math.max(s[1], s[2]))) / 100) * ftp())} W`
          : `${de(routeLength(def) / 1000, 1)} km · ${de(routeClimb(def))} Höhenmeter`;
        left.append(el('b', null, def.name), el('small', null, meta));
        const go = el('button', 'wkstart', 'Start');
        go.type = 'button';
        go.disabled = !trainer.connected;
        go.onclick = () => startRide(kind, def);
        top.append(left, go);
        row.append(top, profile(kind, def).svg, el('p', 'wktext', def.text), prepBlock(kind, def));
        list.append(row);
      }
    }
    renderList();
    renderPlan();
    statusHook();

    // Verlauf
    const rides = store.get(RIDES_KEY, []);
    if (rides.length) {
      const hist = el('section', 'card');
      hist.id = 'rideHistory';
      hist.append(el('h2', null, 'Letzte Fahrten'));
      for (const r of rides) {
        const row = el('button', 'hist');
        row.type = 'button';
        const d = new Date(r.date).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
        const mid = el('div', null, r.name);
        mid.append(el('small', null, `${d} · ${clock(r.stats.duration)}`));
        row.append(el('div', 'sc', String(r.stats.avgPower)), mid, el('div', 'r', `Ø Watt`), el('div', 'go', '→'));
        row.onclick = () => summary(r, true);
        hist.append(row);
      }
      root.append(hist);
    }
    root.append(el('p', 'note', 'Die Fahrten werden nur im Speicher dieses Browsers abgelegt. Trainiere nur, wenn du gesund bist; brich ab, wenn dir schwindlig wird oder etwas schmerzt.'));
  }

  // ---------- Fahrt ----------
  async function startRide(kind, def, planKey = null) {
    ride = { planKey, kind, def, name: def.name, t: 0, dist: 0, v: 0, samples: [], paused: false, bias: 1, date: Date.now(), lastCmd: null, grade: 0 };
    statusHook = null;
    document.body.classList.add('busy');
    wakeLock = await navigator.wakeLock?.request('screen').catch(() => null);
    window.scrollTo(0, 0);

    const top = el('div', 'ridetop');
    const title = el('div');
    const segInfo = el('small');
    title.append(el('b', null, def.name), segInfo);
    const time = el('div', 'ridetime');
    top.append(title, time);

    const tiles = el('div', 'ridetiles');
    const tile = (label, cls = '') => {
      const t = el('div', `rt ${cls}`), v = el('b', null, '–');
      t.append(v, el('small', null, label));
      tiles.append(t);
      return v;
    };
    const vPower = tile('Watt', 'main'), vTarget = tile(kind === 'workout' ? 'Ziel' : 'Steigung', 'main');
    const vCad = tile('Trittfrequenz'), vHr = tile('Herzfrequenz'), vSpeed = tile('km/h'), vDist = tile('km');

    const chart = el('div', 'ridechart');
    const pf = profile(kind, def, { H: 130, big: true });
    const trace = svgEl('polyline', { fill: 'none', stroke: ACCENT, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, pf.svg);
    const cursor = svgEl('line', { y1: pf.T - 4, y2: pf.H - pf.B, stroke: INK, 'stroke-width': 1.2 }, pf.svg);
    const marker = svgEl('circle', { r: 4, fill: ACCENT, stroke: '#f3f1ec', 'stroke-width': 2 }, pf.svg);
    const legend = el('div', 'ridelegend');
    legend.append(el('span', 'lg ink', kind === 'workout' ? 'Ziel' : 'Höhenprofil'), el('span', 'lg acc', kind === 'workout' ? 'Deine Leistung' : 'Deine Position'));
    chart.append(pf.svg, legend);
    const topPct = Math.max(130, ...(def.segs ?? []).map((s) => Math.max(s[1], s[2]))) + 5;
    const pts = [];

    const ctl = el('div', 'row wrap');
    const btn = (label, cls, fn) => { const b = el('button', cls, label); b.type = 'button'; b.onclick = fn; ctl.append(b); return b; };
    let biasLabel = null;
    if (kind === 'workout') {
      btn('− 5 %', 'secondary', () => { ride.bias = Math.max(0.5, ride.bias - 0.05); ride.lastCmd = null; liveHook(); });
      btn('+ 5 %', 'secondary', () => { ride.bias = Math.min(1.5, ride.bias + 0.05); ride.lastCmd = null; liveHook(); });
      biasLabel = el('p', 'hint ridebias');
    }
    const pauseBtn = btn('Pause', 'secondary', () => {
      ride.paused = !ride.paused;
      pauseBtn.textContent = ride.paused ? 'Weiter' : 'Pause';
      liveHook();
    });
    btn('Beenden', 'primary', () => finishRide());
    const warn = el('p', 'alert');
    warn.hidden = true;
    root.replaceChildren(top, tiles, chart, ctl, ...(biasLabel ? [biasLabel] : []), warn);

    liveHook = () => {
      if (!ride) return;
      const d = trainer.data;
      vPower.textContent = de(power3s());
      vCad.textContent = d.cadence ? de(d.cadence) : '–';
      vHr.textContent = d.hr ? de(d.hr) : '–';
      vSpeed.textContent = de(ride.v * 3.6, 1);
      vDist.textContent = de(ride.dist / 1000, 2);
      warn.hidden = trainer.connected;
      warn.textContent = 'Die Verbindung zum Trainer ist abgebrochen. Die Fahrt läuft weiter – du kannst sie beenden und speichern.';
      if (kind === 'workout') {
        const total = workoutDuration(def), tg = targetAt(def, ride.t, ftp());
        time.textContent = clock(total - ride.t);
        vTarget.textContent = tg ? de(tg.watts * ride.bias) : '–';
        segInfo.textContent = ride.paused ? 'Pausiert' : tg ? `Abschnitt ${tg.index + 1} von ${def.segs.length} · noch ${clock(tg.remaining)}` : '';
        biasLabel.textContent = ride.bias === 1 ? 'Intensität 100 %' : `Intensität ${Math.round(ride.bias * 100)} %`;
        cursor.setAttribute('x1', pf.x(ride.t)); cursor.setAttribute('x2', pf.x(ride.t));
        marker.setAttribute('cx', pf.x(ride.t));
        marker.setAttribute('cy', pf.y(Math.min(topPct, (power3s() / ftp()) * 100)));
      } else {
        time.textContent = clock(ride.t);
        vTarget.textContent = `${ride.grade > 0 ? '+' : ''}${de(ride.grade, 1)} %`;
        segInfo.textContent = ride.paused ? 'Pausiert' : `noch ${de((pf.total - ride.dist) / 1000, 1)} km · ${de(elevationAt(def, ride.dist))} m ü. M.`;
        cursor.setAttribute('x1', pf.x(ride.dist)); cursor.setAttribute('x2', pf.x(ride.dist));
        marker.setAttribute('cx', pf.x(ride.dist));
        marker.setAttribute('cy', pf.y(elevationAt(def, ride.dist)));
      }
    };

    ride.timer = setInterval(() => {
      if (!ride || ride.paused) return;
      const d = trainer.data, power = d.power || 0;
      let target = null;
      if (kind === 'workout') {
        const tg = targetAt(def, ride.t, ftp());
        if (!tg) return finishRide();
        target = Math.round(tg.watts * ride.bias);
        if (target !== ride.lastCmd) { trainer.setTargetPower(target); ride.lastCmd = target; }
        ride.grade = 0;
        pts.push(`${pf.x(ride.t).toFixed(1)},${pf.y(Math.min(topPct, (power / ftp()) * 100)).toFixed(1)}`);
        trace.setAttribute('points', pts.join(' '));
      } else {
        ride.grade = gradeAt(def, ride.dist);
        const cmd = Math.round(ride.grade * 10) / 10;
        if (cmd !== ride.lastCmd) { trainer.setGrade(cmd); ride.lastCmd = cmd; }
      }
      ride.v = stepSpeed(ride.v, power, ride.grade, mass(), 1);
      ride.dist += ride.v;
      ride.samples.push({ power, cad: d.cadence || 0, hr: d.hr || null, speed: Math.round(ride.v * 36) / 10, dist: Math.round(ride.dist * 10) / 10, target });
      ride.t++;
      if (kind === 'route' && ride.dist >= pf.total) return finishRide();
      liveHook();
    }, 1000);
    liveHook();
  }

  function finishRide() {
    if (!ride) return;
    clearInterval(ride.timer);
    trainer.release();
    wakeLock?.release().catch(() => {});
    const done = { date: ride.date, name: ride.name, kind: ride.kind, ftp: ftp(), stats: summarize(ride.samples, ftp()), samples: ride.samples };
    // Einheit aus dem Einsteigerplan gilt als erledigt, wenn mindestens 80 % gefahren wurden
    const share = ride.kind === 'workout' ? ride.t / workoutDuration(ride.def) : ride.dist / routeLength(ride.def);
    if (ride.planKey && share >= 0.8) { prefs.planDone[ride.planKey] = Date.now(); savePrefs(); }
    ride = null; liveHook = null;
    document.body.classList.remove('busy');
    if (done.stats.duration >= 60) {
      // Sekundenwerte nur für die drei neuesten Fahrten behalten
      const list = [done, ...store.get(RIDES_KEY, [])].slice(0, 10).map((r, i) => (i < 3 ? r : { ...r, samples: null }));
      if (!store.set(RIDES_KEY, list)) store.set(RIDES_KEY, list.map((r) => ({ ...r, samples: null })));
    }
    summary(done, false);
  }

  // ---------- Auswertung ----------
  function summary(r, stored) {
    const s = r.stats;
    window.scrollTo(0, 0);
    root.replaceChildren(header(new Date(r.date).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })));
    const head = el('div', 'pagehead');
    head.append(el('h1', null, r.name), el('p', null,
      s.duration < 60 ? 'Die Fahrt war kürzer als eine Minute und wurde nicht gespeichert.'
        : `${clock(s.duration)} gefahren, im Schnitt ${de(s.avgPower)} Watt.`));
    root.append(head);
    const tiles = el('div', 'stats stats4');
    const tile = (v, label) => { const t = el('div', 'stat'); t.append(el('b', null, v), el('small', null, label)); tiles.append(t); };
    tile(clock(s.duration), 'Dauer');
    tile(de(s.avgPower), 'Ø Watt');
    tile(de(s.np), 'Normalized Power');
    tile(de(s.tss), 'TSS');
    tile(s.avgCad ? de(s.avgCad) : '–', 'Ø U/min');
    tile(s.avgHr ? de(s.avgHr) : '–', 'Ø Puls');
    tile(de(s.dist / 1000, 1), 'Kilometer');
    tile(de(s.kj), 'Kilojoule');
    root.append(tiles);

    if (r.samples?.length > 1) {
      const card = el('section', 'card');
      card.append(el('h2', null, 'Leistung über die Fahrt'));
      const wrap = el('div', 'chartwrap');
      const W = 340, H = 150, L = 30, R = 8, T = 10, B = 20;
      const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Liniendiagramm der Leistung über die Fahrt' }, wrap);
      // auf höchstens 300 Punkte mitteln
      const step = Math.ceil(r.samples.length / 300), pts = [];
      for (let i = 0; i < r.samples.length; i += step) {
        const part = r.samples.slice(i, i + step);
        pts.push({ t: i, v: part.reduce((a, b) => a + (b.power || 0), 0) / part.length });
      }
      const top = Math.max(100, Math.ceil(Math.max(...pts.map((p) => p.v)) / 50) * 50);
      const x = (t) => L + (t / (r.samples.length - 1)) * (W - L - R), y = (v) => T + (1 - v / top) * (H - T - B);
      const text = (str, tx, ty, anchor = 'middle') => { const t = svgEl('text', { x: tx, y: ty, 'text-anchor': anchor, fill: MUTED, 'font-size': 8.5, 'font-family': FONT }, svg); t.textContent = str; };
      for (let v = 0; v <= top; v += top / 2) {
        svgEl('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: LINE, 'stroke-width': 1 }, svg);
        text(de(v), L - 5, y(v) + 3, 'end');
      }
      if (r.ftp <= top) {
        svgEl('line', { x1: L, x2: W - R, y1: y(r.ftp), y2: y(r.ftp), stroke: MUTED, 'stroke-width': 0.8, 'stroke-dasharray': '2 3' }, svg);
        text('FTP', W - R, y(r.ftp) - 3, 'end');
      }
      text('0:00', L, H - 6, 'start'); text(clock(r.samples.length), W - R, H - 6, 'end');
      svgEl('polyline', { points: pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '), fill: 'none', stroke: INK, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, svg);
      const cross = svgEl('line', { y1: T, y2: H - B, stroke: MUTED, 'stroke-width': 1, visibility: 'hidden' }, svg);
      const dot = svgEl('circle', { r: 3.5, fill: ACCENT, stroke: '#f3f1ec', 'stroke-width': 2, visibility: 'hidden' }, svg);
      const tip = el('div', 'tooltip');
      tip.hidden = true;
      wrap.append(tip);
      const move = (e) => {
        const box = svg.getBoundingClientRect(), fx = ((e.clientX - box.left) / box.width) * W;
        const p = pts.reduce((a, c) => (Math.abs(x(c.t) - fx) < Math.abs(x(a.t) - fx) ? c : a));
        cross.setAttribute('x1', x(p.t)); cross.setAttribute('x2', x(p.t));
        dot.setAttribute('cx', x(p.t)); dot.setAttribute('cy', y(p.v));
        cross.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');
        tip.hidden = false;
        tip.replaceChildren(`${clock(p.t)}: `, el('b', null, `${de(p.v)} W`));
        tip.style.left = `${Math.max(18, Math.min(82, (x(p.t) / W) * 100))}%`;
      };
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerdown', move);
      svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); });
      card.append(wrap);
      root.append(card);

      const dl = el('button', 'secondary', 'Als TCX-Datei speichern');
      dl.type = 'button';
      dl.onclick = () => {
        const a = el('a');
        a.href = URL.createObjectURL(new Blob([toTcx(r.date, r.samples)], { type: 'application/vnd.garmin.tcx+xml' }));
        a.download = `sitzcheck-${new Date(r.date).toISOString().slice(0, 10)}.tcx`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      };
      root.append(dl, el('p', 'hint', 'Die TCX-Datei lässt sich z. B. bei Strava, Garmin Connect oder TrainingPeaks hochladen.'));
    } else if (stored) {
      root.append(el('p', 'hint', 'Für diese ältere Fahrt sind nur die Kennzahlen gespeichert.'));
    }
    const back = el('button', 'primary', 'Zurück zur Übersicht');
    back.type = 'button';
    back.onclick = home;
    root.append(back);
  }

  home();
}
