// Zielbereiche und Empfehlungen. Alle Werte sind Richtwerte für die
// dynamische Messung aus der Seitenansicht – kein Ersatz für ein Bikefitting.

export const STYLES = {
  komfort: { label: 'Komfort / Ausdauer', torso: [45, 60], shoulder: [70, 90], elbow: [145, 170], hipMin: 43 },
  sport: { label: 'Sportlich', torso: [38, 50], shoulder: [80, 95], elbow: [145, 170], hipMin: 36 },
  rennen: { label: 'Rennen / Aero', torso: [28, 42], shoulder: [85, 100], elbow: [135, 165], hipMin: 28 },
};

const KNEE_EXT = [140, 150];
const KNEE_FLEX = [65, 80];
const KOPS = [-3, 3];

function status(v, [lo, hi], tol) {
  if (v >= lo && v <= hi) return 'ok';
  if (v >= lo - tol && v <= hi + tol) return 'warn';
  return 'bad';
}

/** Nötige Sattelhöhen-Änderung (mm, auf 5 mm gerundet), um den Ziel-Kniewinkel zu erreichen. */
function saddleDeltaMm(kneeDeg, targetDeg, { thighPx, shankPx, pxPerCm }) {
  const legLen = (a) =>
    Math.sqrt(thighPx ** 2 + shankPx ** 2 - 2 * thighPx * shankPx * Math.cos((a * Math.PI) / 180));
  const mm = (Math.abs(legLen(targetDeg) - legLen(kneeDeg)) / pxPerCm) * 10;
  return Math.min(30, Math.max(5, Math.round(mm / 5) * 5));
}

export function evaluate(result, styleKey) {
  const st = STYLES[styleKey] ?? STYLES.sport;
  const m = result.metrics;
  const items = [];

  // --- Sattelhöhe: Kniestreckung unten ---
  {
    const s = status(m.kneeExt, KNEE_EXT, 4);
    let tip = 'Die Sattelhöhe passt.';
    if (m.kneeExt < KNEE_EXT[0]) {
      const mm = saddleDeltaMm(m.kneeExt, KNEE_EXT[0] + 3, result.geometry);
      tip = `Das Bein wird unten zu wenig gestreckt – der Sattel ist vermutlich zu niedrig. Sattel um etwa ${mm} mm höher stellen` +
        (mm > 5 ? ' (in Schritten von höchstens 5 mm, dazwischen neu messen).' : '.');
    } else if (m.kneeExt > KNEE_EXT[1]) {
      const mm = saddleDeltaMm(m.kneeExt, KNEE_EXT[1] - 3, result.geometry);
      tip = `Das Bein wird unten sehr weit gestreckt – der Sattel ist vermutlich zu hoch (oft kippt dann auch das Becken hin und her). Sattel um etwa ${mm} mm tiefer stellen` +
        (mm > 5 ? ' (in Schritten von höchstens 5 mm, dazwischen neu messen).' : '.');
    }
    items.push({
      key: 'kneeExt', label: 'Kniewinkel unten (Streckung)', group: 'Sattelhöhe',
      value: m.kneeExt, unit: '°', range: `${KNEE_EXT[0]}–${KNEE_EXT[1]}°`, status: s, tip,
    });
  }

  // --- Kniebeugung oben ---
  {
    const s = status(m.kneeFlex, KNEE_FLEX, 4);
    let tip = 'Die Kniebeugung am oberen Totpunkt ist unauffällig.';
    if (m.kneeFlex < KNEE_FLEX[0]) {
      tip = 'Das Knie wird oben sehr stark gebeugt. Das belastet das Knie – häufige Ursachen: Sattel zu niedrig oder Kurbel zu lang.';
    } else if (m.kneeFlex > KNEE_FLEX[1]) {
      tip = 'Das Knie wird oben nur wenig gebeugt. Für sich allein unkritisch; zusammen mit einer sehr großen Streckung unten spricht es für einen zu hohen Sattel.';
    }
    items.push({
      key: 'kneeFlex', label: 'Kniewinkel oben (Beugung)', group: 'Sattelhöhe',
      value: m.kneeFlex, unit: '°', range: `${KNEE_FLEX[0]}–${KNEE_FLEX[1]}°`, status: s, tip,
    });
  }

  // --- Knielot ---
  if (m.kops != null) {
    const s = status(m.kops, KOPS, 1.5);
    let tip = 'Das Knie steht bei waagerechter Kurbel etwa über der Pedalachse.';
    if (m.kops > KOPS[1]) {
      tip = 'Das Knie steht bei waagerechter Kurbel deutlich vor der Pedalachse. Sattel in kleinen Schritten (ca. 5 mm) nach hinten schieben – danach die Sattelhöhe erneut prüfen.';
    } else if (m.kops < KOPS[0]) {
      tip = 'Das Knie steht bei waagerechter Kurbel deutlich hinter der Pedalachse. Sattel in kleinen Schritten (ca. 5 mm) nach vorn schieben – danach die Sattelhöhe erneut prüfen.';
    }
    const sign = m.kops > 0 ? '+' : '';
    items.push({
      key: 'kops', label: 'Knielot (Knie zu Pedalachse)', group: 'Sattel vor/zurück',
      value: `${sign}${m.kops}`, unit: ' cm', range: `${KOPS[0]} bis +${KOPS[1]} cm`, status: s,
      tip: tip + ' Dieser Wert ist per Kamera nur grob bestimmbar.',
    });
  }

  // --- Oberkörper ---
  {
    const s = status(m.torso, st.torso, 5);
    let tip = `Die Oberkörperneigung passt zum Fahrstil „${st.label}“.`;
    if (m.torso < st.torso[0]) {
      tip = `Du sitzt für „${st.label}“ sehr flach. Wenn Nacken, Rücken oder Hände ermüden: Lenker höher (Spacer unter den Vorbau) oder kürzeren Vorbau wählen.`;
    } else if (m.torso > st.torso[1]) {
      tip = `Du sitzt für „${st.label}“ recht aufrecht. Wenn du sportlicher sitzen möchtest: Lenker tiefer (Spacer über den Vorbau) oder längeren Vorbau wählen.`;
    }
    items.push({
      key: 'torso', label: 'Oberkörperwinkel zur Waagerechten', group: 'Lenkerhöhe',
      value: m.torso, unit: '°', range: `${st.torso[0]}–${st.torso[1]}°`, status: s, tip,
    });
  }

  // --- Hüftwinkel ---
  {
    const s = m.hipMin >= st.hipMin ? 'ok' : m.hipMin >= st.hipMin - 5 ? 'warn' : 'bad';
    const tip = s === 'ok'
      ? 'Die Hüfte hat am oberen Totpunkt genug Platz.'
      : 'Der Hüftwinkel wird oben sehr eng. Das kostet Leistung und kann in Hüfte und unterem Rücken zwicken. Abhilfe: Lenker höher, Sattel etwas weiter vor oder kürzere Kurbeln.';
    items.push({
      key: 'hipMin', label: 'Hüftwinkel oben (engste Stelle)', group: 'Lenkerhöhe',
      value: m.hipMin, unit: '°', range: `mind. ${st.hipMin}°`, status: s, tip,
    });
  }

  // --- Arme ---
  if (m.shoulder != null) {
    const s = status(m.shoulder, st.shoulder, 5);
    let tip = 'Der Winkel zwischen Oberkörper und Oberarm passt.';
    if (m.shoulder > st.shoulder[1]) {
      tip = 'Die Arme sind weit nach vorn gestreckt – die Sitzlänge ist vermutlich zu groß. Kürzeren Vorbau probieren oder die Griffposition näher holen.';
    } else if (m.shoulder < st.shoulder[0]) {
      tip = 'Die Arme stehen sehr nah am Oberkörper – das Cockpit ist vermutlich zu kurz. Längeren Vorbau probieren.';
    }
    items.push({
      key: 'shoulder', label: 'Schulterwinkel (Oberkörper zu Oberarm)', group: 'Sitzlänge',
      value: m.shoulder, unit: '°', range: `${st.shoulder[0]}–${st.shoulder[1]}°`, status: s, tip,
    });
  }
  if (m.elbow != null) {
    const s = status(m.elbow, st.elbow, 5);
    let tip = 'Die Ellbogen sind leicht gebeugt – so sollen sie sein.';
    if (m.elbow > st.elbow[1]) {
      tip = 'Die Arme sind fast durchgestreckt. Stöße gehen dann direkt in Schultern und Nacken. Ellbogen bewusst locker beugen; wenn das nicht geht, ist das Cockpit zu lang oder zu tief.';
    } else if (m.elbow < st.elbow[0]) {
      tip = 'Die Ellbogen sind stark gebeugt. Auf Dauer ermüdet das Arme und Schultern – möglicherweise ist das Cockpit zu kurz oder zu hoch.';
    }
    items.push({
      key: 'elbow', label: 'Ellbogenwinkel', group: 'Sitzlänge',
      value: m.elbow, unit: '°', range: `${st.elbow[0]}–${st.elbow[1]}°`, status: s, tip,
    });
  }

  return items;
}
