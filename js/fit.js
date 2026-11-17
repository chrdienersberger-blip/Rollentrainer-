// Schreibt eine Fahrt als FIT-Datei – das Format, das Strava, Garmin Connect,
// TrainingPeaks und die meisten anderen Plattformen am zuverlässigsten annehmen.
// Reine Datenverarbeitung ohne Browser-APIs.

const FIT_EPOCH = 631065600;                      // Sekunden zwischen 1.1.1970 und 31.12.1989
const T = { enum: [0x00, 1], uint8: [0x02, 1], uint16: [0x84, 2], uint32: [0x86, 4], uint32z: [0x8c, 4] };
const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];

export function fitCrc(bytes, crc = 0) {
  for (const b of bytes) {
    let tmp = CRC_TABLE[crc & 0xf];
    crc = ((crc >> 4) & 0x0fff) ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = ((crc >> 4) & 0x0fff) ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc;
}

/**
 * startMs: Beginn der Fahrt (Unix-Millisekunden)
 * samples: ein Eintrag je Sekunde { power, cad, hr, speed (km/h), dist (m) }
 */
export function toFit(startMs, samples) {
  const out = [];
  const defined = new Map();
  /** Nachricht schreiben; die Beschreibung der Felder wird beim ersten Mal vorangestellt. */
  const write = (local, global, fields) => {
    if (!defined.has(local)) {
      defined.set(local, true);
      out.push(0x40 | local, 0, 0, global & 0xff, global >> 8, fields.length);
      for (const [num, type] of fields) out.push(num, T[type][1], T[type][0]);
    }
    out.push(local);
    for (const [, type, value] of fields) {
      const size = T[type][1];
      let v = Math.max(0, Math.round(value)) >>> 0;
      for (let i = 0; i < size; i++) { out.push(v & 0xff); v = Math.floor(v / 256); }
    }
  };
  const start = Math.round(startMs / 1000) - FIT_EPOCH;
  const n = samples.length, end = start + Math.max(0, n - 1);
  const power = samples.map((s) => Math.max(0, Math.round(s.power || 0)));
  const hr = samples.map((s) => s.hr).filter(Boolean), cad = samples.map((s) => s.cad).filter((c) => c > 0);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const dist = n ? samples[n - 1].dist ?? 0 : 0;

  write(0, 0, [[0, 'enum', 4], [1, 'uint16', 255], [2, 'uint16', 1], [3, 'uint32z', 12345], [4, 'uint32', start]]);   // Datei: Aktivität
  write(6, 49, [[0, 'uint16', 100], [1, 'uint8', 1]]);                                                                        // erzeugendes Programm
  write(7, 23, [[253, 'uint32', start], [0, 'uint8', 0], [2, 'uint16', 255], [4, 'uint16', 1], [3, 'uint32z', 12345], [5, 'uint16', 100]]); // Gerät
  write(1, 21, [[253, 'uint32', start], [0, 'enum', 0], [1, 'enum', 0]]);                                          // Timer gestartet
  samples.forEach((s, i) => write(2, 20, [
    [253, 'uint32', start + i],
    [5, 'uint32', (s.dist ?? 0) * 100],
    [6, 'uint16', Math.min(65534, ((s.speed ?? 0) / 3.6) * 1000)],
    [7, 'uint16', power[i]],
    [3, 'uint8', s.hr ? Math.min(254, s.hr) : 0xff],                                                                // 0xFF = kein Wert
    [4, 'uint8', s.cad > 0 ? Math.min(254, s.cad) : 0xff],
  ]));
  write(1, 21, [[253, 'uint32', end], [0, 'enum', 0], [1, 'enum', 4]]);                                            // Timer gestoppt
  write(3, 19, [[254, 'uint16', 0], [253, 'uint32', end], [2, 'uint32', start], [7, 'uint32', n * 1000], [8, 'uint32', n * 1000],
    [9, 'uint32', dist * 100], [0, 'enum', 9], [1, 'enum', 1], [19, 'uint16', avg(power)], [20, 'uint16', Math.max(0, ...power)]]);
  write(4, 18, [[254, 'uint16', 0], [253, 'uint32', end], [2, 'uint32', start], [7, 'uint32', n * 1000], [8, 'uint32', n * 1000],
    [9, 'uint32', dist * 100], [5, 'enum', 2], [6, 'enum', 6], [0, 'enum', 8], [1, 'enum', 1], [25, 'uint16', 0], [26, 'uint16', 1],
    [20, 'uint16', avg(power)], [21, 'uint16', Math.max(0, ...power)],
    [16, 'uint8', hr.length ? avg(hr) : 0xff], [18, 'uint8', cad.length ? avg(cad) : 0xff]]);                       // Radfahren, drinnen
  const tz = -new Date(startMs).getTimezoneOffset() * 60;                                                                     // Ortszeit für Garmin
  write(5, 34, [[253, 'uint32', end], [0, 'uint32', n * 1000], [1, 'uint16', 1], [2, 'enum', 0], [3, 'enum', 26], [4, 'enum', 1], [5, 'uint32', end + tz]]);

  const data = Uint8Array.from(out);
  const header = new Uint8Array(14);
  const hv = new DataView(header.buffer);
  header[0] = 14; header[1] = 0x10;
  hv.setUint16(2, 2132, true);
  hv.setUint32(4, data.length, true);
  header.set([0x2e, 0x46, 0x49, 0x54], 8);                                                                          // ".FIT"
  hv.setUint16(12, fitCrc(header.subarray(0, 12)), true);
  const file = new Uint8Array(14 + data.length + 2);
  file.set(header, 0);
  file.set(data, 14);
  new DataView(file.buffer).setUint16(14 + data.length, fitCrc(file.subarray(0, 14 + data.length)), true);
  return file;
}
