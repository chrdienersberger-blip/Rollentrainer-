// Bluetooth-Protokoll der Smart Trainer (reine Datenverarbeitung, ohne Browser-APIs).
// FTMS = Fitness Machine Service, der Standard, den u. a. Wahoo Kickr, Tacx und Elite sprechen.

export const UUID = {
  ftms: 0x1826, indoorBikeData: 0x2ad2, controlPoint: 0x2ad9,
  power: 0x1818, powerMeasurement: 0x2a63,
  heartRate: 0x180d, heartRateMeasurement: 0x2a37,
};

/** Indoor Bike Data (0x2AD2) → { speedKmh, cadence, power, hr, distance } (nur vorhandene Felder). */
export function parseIndoorBikeData(dv) {
  const flags = dv.getUint16(0, true);
  const out = {};
  let o = 2;
  if (!(flags & 0x0001)) { out.speedKmh = dv.getUint16(o, true) / 100; o += 2; }
  if (flags & 0x0002) o += 2;                                             // Durchschnittstempo
  if (flags & 0x0004) { out.cadence = dv.getUint16(o, true) / 2; o += 2; }
  if (flags & 0x0008) o += 2;                                             // Durchschnitts-Trittfrequenz
  if (flags & 0x0010) { out.distance = dv.getUint16(o, true) + (dv.getUint8(o + 2) << 16); o += 3; }
  if (flags & 0x0020) o += 2;                                             // Widerstandsstufe
  if (flags & 0x0040) { out.power = dv.getInt16(o, true); o += 2; }
  if (flags & 0x0080) o += 2;                                             // Durchschnittsleistung
  if (flags & 0x0100) o += 5;                                             // Energie
  if (flags & 0x0200) { out.hr = dv.getUint8(o); o += 1; }
  return out;
}

/**
 * Cycling Power Measurement (0x2A63). prev = letzter Kurbelstand { revs, time } für die Trittfrequenz.
 * Liefert { power, cadence?, crank? }.
 */
export function parseCyclingPower(dv, prev = null) {
  const flags = dv.getUint16(0, true);
  const out = { power: dv.getInt16(2, true) };
  let o = 4;
  if (flags & 0x01) o += 1;   // Pedal-Balance
  if (flags & 0x04) o += 2;   // Drehmoment
  if (flags & 0x10) o += 6;   // Radumdrehungen
  if (flags & 0x20) {
    const crank = { revs: dv.getUint16(o, true), time: dv.getUint16(o + 2, true) };
    out.crank = crank;
    if (prev) {
      const dRev = (crank.revs - prev.revs) & 0xffff, dT = ((crank.time - prev.time) & 0xffff) / 1024;
      if (dT > 0 && dRev > 0) out.cadence = Math.round((dRev / dT) * 60);
      else if (dT === 0) out.cadence = undefined; // keine neue Umdrehung seit dem letzten Paket
    }
  }
  return out;
}

export function parseHeartRate(dv) {
  return dv.getUint8(0) & 0x01 ? dv.getUint16(1, true) : dv.getUint8(1);
}

// --- Befehle an den Control Point (0x2AD9) ---
export const cmdRequestControl = () => Uint8Array.of(0x00);
export const cmdStart = () => Uint8Array.of(0x07);

/** ERG-Modus: Zielleistung in Watt. */
export function cmdTargetPower(watts) {
  const b = new DataView(new ArrayBuffer(3));
  b.setUint8(0, 0x05);
  b.setInt16(1, Math.max(0, Math.round(watts)), true);
  return new Uint8Array(b.buffer);
}

/** Simulationsmodus: Steigung in Prozent, dazu Rollwiderstand und Luftwiderstand. */
export function cmdSimulation(gradePct, { windMs = 0, crr = 0.004, cw = 0.51 } = {}) {
  const b = new DataView(new ArrayBuffer(7));
  b.setUint8(0, 0x11);
  b.setInt16(1, Math.round(windMs * 1000), true);
  b.setInt16(3, Math.round(gradePct * 100), true);
  b.setUint8(5, Math.round(crr * 10000));
  b.setUint8(6, Math.round(cw * 100));
  return new Uint8Array(b.buffer);
}
