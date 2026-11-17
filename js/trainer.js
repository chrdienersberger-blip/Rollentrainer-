// Verbindung zum Smart Trainer per Bluetooth (FTMS), mit Demo-Trainer zum Ausprobieren.
// Zwei Wege zum Funkchip: im Browser Web Bluetooth, in der iPhone-App die eingebaute
// Bluetooth-Technik des Geräts (siehe app/native-ble.js). Beide bieten dieselben fünf Funktionen.

import { UUID, parseIndoorBikeData, parseCyclingPower, parseHeartRate, cmdRequestControl, cmdStart, cmdTargetPower, cmdSimulation } from './ftms.js?v=21';

const isNativeApp = () => !!globalThis.Capacitor?.isNativePlatform?.();
export const bluetoothAvailable = () => isNativeApp() || !!globalThis.navigator?.bluetooth;

const NAMES = ['KICKR', 'Wahoo', 'Tacx', 'Elite', 'Zwift', 'Saris', 'Direto', 'Suito'];
// Uhren und Gurte, die ihre Herzfrequenz senden, nennen den Dienst nicht immer in ihrer Kennung – deshalb zusätzlich nach Namen suchen
const HR_NAMES = ['Forerunner', 'fenix', 'Fenix', 'FR', 'Venu', 'vivoactive', 'Instinct', 'Epix', 'epix', 'Enduro', 'Garmin', 'HRM', 'TICKR', 'Polar', 'Suunto', 'COROS'];

/** Web Bluetooth (Chrome, Edge und Spezial-Browser). */
const webBle = {
  async pick({ all = false, heartRate = false } = {}) {
    const optionalServices = [UUID.ftms, UUID.power, UUID.heartRate];
    const device = await navigator.bluetooth.requestDevice(
      heartRate ? (all ? { acceptAllDevices: true, optionalServices: [UUID.heartRate] }
        : { filters: [{ services: [UUID.heartRate] }, ...HR_NAMES.map((namePrefix) => ({ namePrefix }))], optionalServices: [UUID.heartRate] })
        : all ? { acceptAllDevices: true, optionalServices }
          : { filters: [{ services: [UUID.ftms] }, { services: [UUID.power] }, ...NAMES.map((namePrefix) => ({ namePrefix }))], optionalServices });
    return { name: device.name, device, chars: new Map() };
  },
  async open(h, onDisconnect) {
    h.device.addEventListener('gattserverdisconnected', onDisconnect);
    try { h.server = await h.device.gatt.connect(); } catch {
      // der erste Versuch scheitert auf manchen Geräten
      await new Promise((r) => setTimeout(r, 800));
      h.server = await h.device.gatt.connect();
    }
  },
  async char(h, service, characteristic) {
    const key = `${service}/${characteristic}`;
    if (!h.chars.has(key)) h.chars.set(key, await (await h.server.getPrimaryService(service)).getCharacteristic(characteristic));
    return h.chars.get(key);
  },
  async listen(h, service, characteristic, cb) {
    const ch = await this.char(h, service, characteristic);
    ch.addEventListener('characteristicvaluechanged', (e) => cb(e.target.value));
    await ch.startNotifications();
  },
  async send(h, service, characteristic, bytes) {
    const ch = await this.char(h, service, characteristic);
    // ältere Web-Bluetooth-Umsetzungen kennen nur writeValue
    return ch.writeValueWithResponse ? ch.writeValueWithResponse(bytes) : ch.writeValue(bytes);
  },
  close(h) { try { h.device.gatt?.disconnect(); } catch { /* schon getrennt */ } },
};

async function defaultTransport() {
  if (!isNativeApp()) return webBle;
  // wird nur in der App geladen; die Datei entsteht beim Bauen der App
  return (await import('./native-ble.js')).nativeBle;
}

export class Trainer {
  /** transport: nur für Tests – sonst wird der passende Weg selbst gewählt. */
  constructor(onChange, transport = null) {
    this.onChange = onChange;         // wird bei jeder Status- oder Datenänderung aufgerufen
    this.transport = transport;
    this.kind = null;                 // 'ble' | 'demo'
    this.name = '';
    this.controllable = false;        // kann Zielleistung/Steigung annehmen
    this.data = { power: 0, cadence: 0, speedKmh: 0, hr: null };
    this.hrName = '';
    this.queue = Promise.resolve();
    this.target = null;
    this.grade = 0;
    this.log = [];
  }
  get connected() { return !!this.kind; }

  // ---------- Bluetooth ----------
  /** all = true zeigt alle Bluetooth-Geräte in der Nähe – falls der Trainer in der gefilterten Liste fehlt. */
  async connectBluetooth(all = false) {
    const ble = this.transport ?? await defaultTransport();
    const h = await ble.pick({ all });
    this.disconnect();
    this.log = [];
    await ble.open(h, () => { if (this.handle === h) this.reset(); });
    this.ble = ble;
    this.handle = h;
    this.name = h.name || 'Smart Trainer';
    let ok = false;
    try {
      await ble.listen(h, UUID.ftms, UUID.indoorBikeData, (dv) => this.push(parseIndoorBikeData(dv)));
      ok = true;
      try {
        await ble.listen(h, UUID.ftms, UUID.controlPoint, () => {});   // Antworten des Trainers müssen abonniert sein
        this.cp = true;
        await this.write(cmdRequestControl());
        await this.write(cmdStart());
        this.controllable = !this.lastWriteError;
        this.log.push(this.controllable ? 'Steuerung: ja' : `Steuerung: nein (${this.lastWriteError})`);
      } catch (err) { this.cp = false; this.log.push(`Steuerung: nein (${err?.name ?? err})`); }
    } catch (err) { this.log.push(`FTMS: nein (${err?.name ?? err})`); /* vielleicht ein reiner Leistungsmesser */ }
    if (!ok) {
      let crank = null;
      await ble.listen(h, UUID.power, UUID.powerMeasurement, (dv) => {
        const d = parseCyclingPower(dv, crank);
        if (d.crank) crank = d.crank;
        this.push({ power: d.power, ...(d.cadence !== undefined ? { cadence: d.cadence } : {}) });
      });
    }
    this.kind = 'ble';
    this.onChange();
  }

  async connectHeartRate(all = false) {
    const ble = this.transport ?? await defaultTransport();
    const h = await ble.pick({ heartRate: true, all });
    await ble.open(h, () => { this.hrName = ''; this.data.hr = null; this.onChange(); });
    try {
      await ble.listen(h, UUID.heartRate, UUID.heartRateMeasurement, (dv) => this.push({ hr: parseHeartRate(dv) }));
    } catch (err) {
      // verbunden, aber das Gerät bietet keine Herzfrequenz an – bei Uhren ist dann das Senden nicht eingeschaltet
      ble.close(h);
      const e = new Error(`${h.name || 'Das Gerät'} sendet keine Herzfrequenz (${err?.name ?? err})`);
      e.name = 'NoHeartRate';
      throw e;
    }
    this.hrHandle = h;
    this.hrName = h.name || 'Herzfrequenz-Sensor';
    this.onChange();
  }

  /** Schreibbefehle nacheinander senden – Bluetooth verträgt keine parallelen Schreibzugriffe. */
  write(bytes) {
    if (!this.cp || !this.handle) return Promise.resolve();
    const { ble, handle } = this;
    this.lastWriteError = null;
    this.queue = this.queue
      .then(() => ble.send(handle, UUID.ftms, UUID.controlPoint, bytes))
      .catch((err) => { this.lastWriteError = err?.name ?? String(err); });
    return this.queue;
  }

  // ---------- Demo ----------
  connectDemo() {
    this.disconnect();
    this.kind = 'demo';
    this.name = 'Demo-Trainer';
    this.controllable = true;
    let p = 120, hr = 95, t = 0;
    this.timer = setInterval(() => {
      t++;
      // im ERG-Modus der Zielleistung folgen, sonst je nach Steigung etwas mehr oder weniger treten
      const want = this.target ?? Math.max(90, 170 + this.grade * 14);
      p += (want - p) * 0.35 + (Math.random() - 0.5) * 10;
      hr += (95 + p * 0.32 - hr) * 0.03;
      this.push({ power: Math.max(0, Math.round(p)), cadence: Math.round(88 + Math.sin(t / 9) * 4), hr: Math.round(hr) });
    }, 1000);
    this.onChange();
  }

  // ---------- Steuerung ----------
  setTargetPower(watts) {
    this.target = watts;
    if (this.kind === 'ble') this.write(cmdTargetPower(watts));
  }
  setGrade(gradePct) {
    this.target = null;
    this.grade = gradePct;
    if (this.kind === 'ble') this.write(cmdSimulation(gradePct));
  }
  release() { this.target = null; this.grade = 0; if (this.kind === 'ble') this.write(cmdSimulation(0)); }

  push(part) {
    Object.assign(this.data, part);
    this.onChange(true);
  }
  reset() {
    clearInterval(this.timer);
    this.kind = null; this.name = ''; this.cp = false; this.handle = null; this.controllable = false;
    this.data = { power: 0, cadence: 0, speedKmh: 0, hr: this.hrName ? this.data.hr : null };
    this.onChange();
  }
  disconnect() {
    const { ble, handle } = this;
    if (this.kind) this.reset();
    if (ble && handle) ble.close(handle);
  }
}
