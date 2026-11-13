// Verbindung zum Smart Trainer per Web Bluetooth (FTMS), mit Demo-Trainer zum Ausprobieren.

import { UUID, parseIndoorBikeData, parseCyclingPower, parseHeartRate, cmdRequestControl, cmdStart, cmdTargetPower, cmdSimulation } from './ftms.js?v=10';

export const bluetoothAvailable = () => !!navigator.bluetooth;

export class Trainer {
  constructor(onChange) {
    this.onChange = onChange;         // wird bei jeder Status- oder Datenänderung aufgerufen
    this.kind = null;                 // 'ble' | 'demo'
    this.name = '';
    this.controllable = false;        // kann Zielleistung/Steigung annehmen
    this.data = { power: 0, cadence: 0, speedKmh: 0, hr: null };
    this.hrName = '';
    this.queue = Promise.resolve();
    this.target = null;
    this.grade = 0;
  }
  get connected() { return !!this.kind; }

  // ---------- Bluetooth ----------
  async connectBluetooth() {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [UUID.ftms] }, { services: [UUID.power] }],
      optionalServices: [UUID.ftms, UUID.power, UUID.heartRate],
    });
    this.disconnect();
    const server = await device.gatt.connect();
    device.addEventListener('gattserverdisconnected', () => { if (this.device === device) this.reset(); });
    this.device = device;
    this.name = device.name || 'Smart Trainer';
    let ok = false;
    try {
      const ftms = await server.getPrimaryService(UUID.ftms);
      const bike = await ftms.getCharacteristic(UUID.indoorBikeData);
      bike.addEventListener('characteristicvaluechanged', (e) => this.push(parseIndoorBikeData(e.target.value)));
      await bike.startNotifications();
      ok = true;
      try {
        this.cp = await ftms.getCharacteristic(UUID.controlPoint);
        await this.cp.startNotifications();          // Antworten des Trainers müssen abonniert sein
        await this.write(cmdRequestControl());
        await this.write(cmdStart());
        this.controllable = true;
      } catch { this.cp = null; }
    } catch { /* kein FTMS – vielleicht ein reiner Leistungsmesser */ }
    if (!ok) {
      const svc = await server.getPrimaryService(UUID.power);
      const pm = await svc.getCharacteristic(UUID.powerMeasurement);
      let crank = null;
      pm.addEventListener('characteristicvaluechanged', (e) => {
        const d = parseCyclingPower(e.target.value, crank);
        if (d.crank) crank = d.crank;
        this.push({ power: d.power, ...(d.cadence !== undefined ? { cadence: d.cadence } : {}) });
      });
      await pm.startNotifications();
    }
    this.kind = 'ble';
    this.onChange();
  }

  async connectHeartRate() {
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [UUID.heartRate] }] });
    const server = await device.gatt.connect();
    const ch = await (await server.getPrimaryService(UUID.heartRate)).getCharacteristic(UUID.heartRateMeasurement);
    ch.addEventListener('characteristicvaluechanged', (e) => this.push({ hr: parseHeartRate(e.target.value) }));
    await ch.startNotifications();
    device.addEventListener('gattserverdisconnected', () => { this.hrName = ''; this.data.hr = null; this.onChange(); });
    this.hrDevice = device;
    this.hrName = device.name || 'Pulsgurt';
    this.onChange();
  }

  /** Schreibbefehle nacheinander senden – Bluetooth verträgt keine parallelen Schreibzugriffe. */
  write(bytes) {
    if (!this.cp) return Promise.resolve();
    this.queue = this.queue.then(() => this.cp.writeValueWithResponse(bytes)).catch(() => {});
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
    this.kind = null; this.name = ''; this.cp = null; this.device = null; this.controllable = false;
    this.data = { power: 0, cadence: 0, speedKmh: 0, hr: this.hrName ? this.data.hr : null };
    this.onChange();
  }
  disconnect() {
    try { this.device?.gatt?.disconnect(); } catch { /* schon getrennt */ }
    if (this.kind) this.reset();
  }
}
