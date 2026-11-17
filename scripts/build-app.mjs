// Stellt die Web-Dateien für die App-Hülle zusammen (Ordner www/) und bündelt
// die Bluetooth-Anbindung der App. Aufruf: npm run app:build
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';

await rm('www', { recursive: true, force: true });
await mkdir('www', { recursive: true });
for (const f of ['index.html', 'style.css', 'manifest.webmanifest', 'js', 'img']) {
  if (existsSync(f)) await cp(f, `www/${f}`, { recursive: true });
}
await build({ entryPoints: ['app/native-ble.js'], bundle: true, format: 'esm', target: 'safari15', outfile: 'www/js/native-ble.js', logLevel: 'warning' });
console.log('www/ ist bereit.');
