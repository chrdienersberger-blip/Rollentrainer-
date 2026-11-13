// Zielbereiche und Empfehlungen. Alle Werte sind Richtwerte für die
// dynamische Messung aus der Seitenansicht – kein Ersatz für ein Bikefitting.

export const STYLES = {
  komfort: { label: 'Komfort', sub: 'Ausdauer, lange Touren', torso: [45, 60], shoulder: [70, 90], elbow: [145, 170], hipMin: 43 },
  sport: { label: 'Sportlich', sub: 'Training, zügige Runden', torso: [38, 50], shoulder: [80, 95], elbow: [145, 170], hipMin: 36 },
  rennen: { label: 'Rennen', sub: 'Tief und aerodynamisch', torso: [28, 42], shoulder: [85, 100], elbow: [135, 165], hipMin: 28 },
  tt: { label: 'Zeitfahren', sub: 'Auf den Armauflagen', torso: [12, 25], shoulder: [75, 95], elbow: [85, 110], hipMin: 28 },
};

const KNEE_EXT = [140, 150];
const KNEE_FLEX = [65, 80];
const KOPS = [-3, 3];

/** Bewertung eines Werts: Status plus Punktzahl (100 = im Zielbereich). */
function rate(v, lo, hi, tol) {
  const d = v < lo ? lo - v : hi != null && v > hi ? v - hi : 0;
  return {
    status: d === 0 ? 'ok' : d <= tol ? 'warn' : 'bad',
    score: Math.round(100 - Math.min(1, d / (2 * tol)) * 80),
  };
}

/** Status eines Einzelwerts (für die Umrandung im Video): 'ok' | 'warn' | 'bad'. */
export function statusOf(key, value, styleKey) {
  const st = STYLES[styleKey] ?? STYLES.sport;
  if (value == null || Number.isNaN(value)) return null;
  if (key === 'kneeExt') return rate(value, KNEE_EXT[0], KNEE_EXT[1], 4).status;
  const [lo, hi] = st[key];
  return rate(value, lo, hi, 5).status;
}

/** Zielbereich eines Winkels für das gewählte Sitzziel: [von, bis]. */
export function rangeOf(key, styleKey) {
  return key === 'kneeExt' ? KNEE_EXT : (STYLES[styleKey] ?? STYLES.sport)[key];
}

/** Nötige Sattelhöhen-Änderung (mm, auf 5 mm gerundet), um den Ziel-Kniewinkel zu erreichen. */
function saddleDeltaMm(kneeDeg, targetDeg, { thighPx, shankPx, pxPerCm }) {
  const legLen = (a) =>
    Math.sqrt(thighPx ** 2 + shankPx ** 2 - 2 * thighPx * shankPx * Math.cos((a * Math.PI) / 180));
  const mm = (Math.abs(legLen(targetDeg) - legLen(kneeDeg)) / pxPerCm) * 10;
  return Math.min(30, Math.max(5, Math.round(mm / 5) * 5));
}

/** Formulierungen für Cockpit-Änderungen, passend zum Rad. */
function cockpitWords(style, bike) {
  if (style === 'tt') {
    return {
      higher: 'Armauflagen höher setzen (Spacer unter die Pads)',
      lower: 'Armauflagen tiefer setzen (Spacer entfernen)',
      shorter: 'Armauflagen und Extensions näher zu dir holen',
      longer: 'Extensions weiter ausziehen oder die Armauflagen nach vorn versetzen',
    };
  }
  if (bike?.integrated) {
    const n = bike.name;
    return {
      higher: `Cockpit höher setzen (Spacer unter die Lenkereinheit des ${n})`,
      lower: `Cockpit tiefer setzen (Spacer am ${n} entfernen)`,
      shorter: `eine kürzere Cockpit-Einheit wählen – beim integrierten Cockpit des ${n} lässt sich der Vorbau je nach Ausstattung nicht einzeln tauschen`,
      longer: `eine längere Cockpit-Einheit wählen – beim integrierten Cockpit des ${n} lässt sich der Vorbau je nach Ausstattung nicht einzeln tauschen`,
    };
  }
  return {
    higher: 'Lenker höher setzen (Spacer unter den Vorbau) oder einen steileren Vorbau montieren',
    lower: 'Lenker tiefer setzen (Spacer über den Vorbau)',
    shorter: 'einen kürzeren Vorbau probieren',
    longer: 'einen längeren Vorbau probieren',
  };
}

export function evaluate(result, styleKey, bike = null) {
  const key = STYLES[styleKey] ? styleKey : 'sport';
  const st = STYLES[key];
  const w = cockpitWords(key, bike);
  const m = result.metrics;
  const items = [];
  const add = (it, lo, hi, tol, weight) =>
    items.push({ ...it, lo, hi, tol, weight, ...rate(it.value, lo, hi, tol) });
  const steps = (mm) => (mm > 5 ? ' – in Schritten von höchstens 5 mm, dazwischen neu messen.' : '.');

  // --- Sattelhöhe: Kniestreckung unten ---
  {
    let tip = 'Die Sattelhöhe passt.', action = null;
    if (m.kneeExt < KNEE_EXT[0]) {
      const mm = result.geometry ? saddleDeltaMm(m.kneeExt, KNEE_EXT[0] + 3, result.geometry) : null;
      action = mm ? `Sattel ca. ${mm} mm höher` : 'Sattel höher stellen';
      tip = `Das Bein wird unten zu wenig gestreckt – der Sattel ist vermutlich zu niedrig. Sattel ${mm ? `um etwa ${mm} mm ` : ''}höher stellen${steps(mm ?? 10)}`;
    } else if (m.kneeExt > KNEE_EXT[1]) {
      const mm = result.geometry ? saddleDeltaMm(m.kneeExt, KNEE_EXT[1] - 3, result.geometry) : null;
      action = mm ? `Sattel ca. ${mm} mm tiefer` : 'Sattel tiefer stellen';
      tip = `Das Bein wird unten sehr weit gestreckt – der Sattel ist vermutlich zu hoch. Sattel ${mm ? `um etwa ${mm} mm ` : ''}tiefer stellen${steps(mm ?? 10)}`;
    }
    add({ key: 'kneeExt', label: 'Kniewinkel unten', sub: 'Streckung am unteren Totpunkt', group: 'Sattelhöhe', value: m.kneeExt, unit: '°', tip, action },
      KNEE_EXT[0], KNEE_EXT[1], 4, 3);
  }

  // --- Kniebeugung oben ---
  {
    let tip = 'Die Kniebeugung am oberen Totpunkt ist unauffällig.', action = null;
    if (m.kneeFlex < KNEE_FLEX[0]) {
      action = 'Kniebeugung oben entlasten';
      tip = 'Das Knie wird oben sehr stark gebeugt. Das belastet das Knie – häufige Ursachen: Sattel zu niedrig oder Kurbel zu lang.';
    } else if (m.kneeFlex > KNEE_FLEX[1]) {
      action = 'Sattelhöhe gegenprüfen';
      tip = 'Das Knie wird oben nur wenig gebeugt. Für sich allein unkritisch; zusammen mit einer sehr großen Streckung unten spricht es für einen zu hohen Sattel.';
    }
    add({ key: 'kneeFlex', label: 'Kniewinkel oben', sub: 'Beugung am oberen Totpunkt', group: 'Sattelhöhe', value: m.kneeFlex, unit: '°', tip, action },
      KNEE_FLEX[0], KNEE_FLEX[1], 4, 1);
  }

  // --- Knielot ---
  if (m.kops != null) {
    let tip = 'Das Knie steht bei waagerechter Kurbel etwa über der Pedalachse.', action = null;
    if (m.kops > KOPS[1]) {
      action = 'Sattel etwas nach hinten';
      tip = 'Das Knie steht bei waagerechter Kurbel deutlich vor der Pedalachse. Sattel in Schritten von ca. 5 mm nach hinten schieben, danach die Sattelhöhe erneut prüfen.';
    } else if (m.kops < KOPS[0]) {
      action = 'Sattel etwas nach vorn';
      tip = 'Das Knie steht bei waagerechter Kurbel deutlich hinter der Pedalachse. Sattel in Schritten von ca. 5 mm nach vorn schieben, danach die Sattelhöhe erneut prüfen.';
    }
    if (key === 'tt') tip += ' Am Zeitfahrrad sitzt man bewusst weiter vorn – ein Knie vor der Pedalachse ist dort normal.';
    add({ key: 'kops', label: 'Knielot', sub: 'Knie zur Pedalachse bei waagerechter Kurbel', group: 'Sattel vor / zurück', value: m.kops, unit: ' cm', signed: true, tip: tip + ' Dieser Wert ist per Kamera nur grob bestimmbar.', action },
      KOPS[0], KOPS[1], 1.5, key === 'tt' ? 0.3 : 1);
  }

  // --- Oberkörper ---
  {
    let tip = `Die Oberkörperneigung passt zum Ziel „${st.label}“.`, action = null;
    if (m.torso < st.torso[0]) {
      action = 'Cockpit höher';
      tip = `Du sitzt für „${st.label}“ sehr flach. Wenn Nacken, Rücken oder Hände ermüden: ${w.higher}.`;
    } else if (m.torso > st.torso[1]) {
      action = 'Cockpit tiefer';
      tip = `Du sitzt für „${st.label}“ recht aufrecht. Wenn du flacher sitzen möchtest: ${w.lower}.`;
    }
    add({ key: 'torso', label: 'Oberkörperwinkel', sub: 'Neigung zur Waagerechten', group: 'Cockpit-Höhe', value: m.torso, unit: '°', tip, action },
      st.torso[0], st.torso[1], 5, 2);
  }

  // --- Hüftwinkel ---
  {
    const tight = m.hipMin < st.hipMin;
    add({
      key: 'hipMin', label: 'Hüftwinkel oben', sub: 'Engste Stelle der Tretbewegung', group: 'Cockpit-Höhe', value: m.hipMin, unit: '°',
      action: tight ? 'Hüftwinkel öffnen' : null,
      tip: tight
        ? `Der Hüftwinkel wird oben sehr eng. Das kostet Leistung und kann in Hüfte und unterem Rücken zwicken. Abhilfe: ${w.higher}, den Sattel etwas weiter vor oder kürzere Kurbeln.`
        : 'Die Hüfte hat am oberen Totpunkt genug Platz.',
    }, st.hipMin, null, 5, 1);
  }

  // --- Arme ---
  if (m.shoulder != null) {
    let tip = 'Der Winkel zwischen Oberkörper und Oberarm passt.', action = null;
    if (m.shoulder > st.shoulder[1]) {
      action = 'Sitzlänge verkürzen';
      tip = `Die Arme sind weit nach vorn gestreckt – die Sitzlänge ist vermutlich zu groß. Abhilfe: ${w.shorter}.`;
    } else if (m.shoulder < st.shoulder[0]) {
      action = 'Sitzlänge verlängern';
      tip = `Die Arme stehen sehr nah am Oberkörper – das Cockpit ist vermutlich zu kurz. Abhilfe: ${w.longer}.`;
    }
    add({ key: 'shoulder', label: 'Schulterwinkel', sub: 'Oberkörper zu Oberarm', group: 'Sitzlänge', value: m.shoulder, unit: '°', tip, action },
      st.shoulder[0], st.shoulder[1], 5, 1);
  }
  if (m.elbow != null) {
    let tip = key === 'tt' ? 'Die Unterarme liegen in einem guten Winkel auf.' : 'Die Ellbogen sind leicht gebeugt – so sollen sie sein.', action = null;
    if (m.elbow > st.elbow[1]) {
      action = key === 'tt' ? 'Armauflagen näher holen' : 'Ellbogen lockerer beugen';
      tip = key === 'tt'
        ? `Die Arme sind sehr weit geöffnet – du liegst gestreckt auf den Auflagen. Abhilfe: ${w.shorter}.`
        : 'Die Arme sind fast durchgestreckt. Stöße gehen dann direkt in Schultern und Nacken. Ellbogen bewusst locker beugen; wenn das nicht geht, ist das Cockpit zu lang oder zu tief.';
    } else if (m.elbow < st.elbow[0]) {
      action = 'Cockpit prüfen (zu kurz/hoch)';
      tip = `Die Ellbogen sind stark gebeugt. Auf Dauer ermüdet das Arme und Schultern – möglicherweise ist das Cockpit zu kurz oder zu hoch. Abhilfe: ${w.longer}.`;
    }
    add({ key: 'elbow', label: 'Ellbogenwinkel', sub: 'Oberarm zu Unterarm', group: 'Sitzlänge', value: m.elbow, unit: '°', tip, action },
      st.elbow[0], st.elbow[1], 5, 1);
  }

  const wSum = items.reduce((s, i) => s + i.weight, 0);
  const score = Math.round(items.reduce((s, i) => s + i.score * i.weight, 0) / wSum);
  // Wichtigste Anpassung: größter gewichteter Punktverlust
  const top = items.filter((i) => i.status !== 'ok')
    .sort((a, c) => (100 - c.score) * c.weight - (100 - a.score) * a.weight)[0] ?? null;
  const verdict = score >= 90 ? 'Sehr gute Position' : score >= 75 ? 'Gute Basis mit Feinschliff'
    : score >= 55 ? 'Deutliches Potenzial' : 'Größere Anpassungen sinnvoll';
  return { items, score, top, verdict, style: key };
}

/** Ruhe im Sattel – Zusatzwerte ohne Einfluss auf die Punktzahl. */
export function stability(extras) {
  const bob = extras.hipBob;
  return {
    value: bob,
    status: bob <= 2.5 ? 'ok' : bob <= 4 ? 'warn' : 'bad',
    tip: bob <= 2.5
      ? 'Dein Becken bleibt beim Treten ruhig.'
      : 'Deine Hüfte bewegt sich bei jeder Umdrehung deutlich auf und ab. Das spricht für einen zu hohen Sattel oder eine zu hohe Trittfrequenz für den gewählten Gang.',
  };
}

/** Startwert für die Sattelhöhe aus der Schrittlänge (LeMond-Formel). */
export function saddleFromInseam(inseamCm) {
  return inseamCm >= 55 && inseamCm <= 110 ? Math.round(inseamCm * 0.883 * 10) / 10 : null;
}
