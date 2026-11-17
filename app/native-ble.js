// Bluetooth in der iPhone-App: nutzt die eingebaute Bluetooth-Technik des Geräts
// über das Capacitor-Plugin. Wird beim Bauen der App zu www/js/native-ble.js gebündelt.
// Bietet dieselben fünf Funktionen wie der Web-Bluetooth-Weg in js/trainer.js.

import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';

const FTMS = 0x1826, POWER = 0x1818, HEART_RATE = 0x180d;
let ready = null;

export const nativeBle = {
  async pick({ all = false, heartRate = false } = {}) {
    ready ??= BleClient.initialize();
    await ready;
    const optionalServices = [FTMS, POWER, HEART_RATE].map(numberToUUID);
    const device = await BleClient.requestDevice(
      heartRate ? (all ? { optionalServices: [numberToUUID(HEART_RATE)] } : { services: [numberToUUID(HEART_RATE)] })
        : all ? { optionalServices }
          : { services: [numberToUUID(FTMS), numberToUUID(POWER)], optionalServices });
    return { name: device.name, id: device.deviceId };
  },
  open: (h, onDisconnect) => BleClient.connect(h.id, onDisconnect),
  listen: (h, service, characteristic, cb) =>
    BleClient.startNotifications(h.id, numberToUUID(service), numberToUUID(characteristic), cb),
  send: (h, service, characteristic, bytes) =>
    BleClient.write(h.id, numberToUUID(service), numberToUUID(characteristic), new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)),
  close(h) { BleClient.disconnect(h.id).catch(() => {}); },
};
