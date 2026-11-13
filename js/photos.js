// Fotos der Räder: eigenes Foto (bleibt auf dem Gerät) oder frei lizenzierte
// Aufnahmen von Wikimedia Commons, die im Browser live gesucht werden.
// Produktfotos der Hersteller sind urheberrechtlich geschützt und deshalb nicht eingebunden.

const OWN_KEY = 'rollentrainer.photos.v1';
const cache = new Map();

const read = () => { try { return JSON.parse(localStorage.getItem(OWN_KEY)) ?? {}; } catch { return {}; } };

export const ownPhoto = (bikeKey) => read()[bikeKey] ?? null;

export function removeOwnPhoto(bikeKey) {
  const all = read();
  delete all[bikeKey];
  try { localStorage.setItem(OWN_KEY, JSON.stringify(all)); } catch { /* optional */ }
}

/** Verkleinert das gewählte Bild und speichert es lokal. Liefert false, wenn der Speicher voll ist. */
export async function saveOwnPhoto(bikeKey, file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const all = read();
  all[bikeKey] = c.toDataURL('image/jpeg', 0.8);
  try { localStorage.setItem(OWN_KEY, JSON.stringify(all)); return true; } catch { return false; }
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plain = (html) => new DOMParser().parseFromString(html ?? '', 'text/html').body.textContent.trim();

/** Passt der Dateititel wirklich zum Modell? Kurze Namen (S5, TCR) nur zusammen mit der Marke. */
export function titleMatches(title, brand, model) {
  const t = title.toLowerCase();
  const word = new RegExp(`(^|[^a-z0-9])${esc(model.toLowerCase())}([^a-z0-9]|$)`);
  if (!word.test(t)) return false;
  return model.length > 4 || t.includes(brand.toLowerCase());
}

/** Frei lizenzierte Fotos zum Modell, beste Treffer zuerst. Leere Liste, wenn nichts Passendes da ist. */
export async function commonsPhotos(bike) {
  if (bike.generic) return [];
  if (cache.has(bike.name)) return cache.get(bike.name);
  const [brand, ...rest] = bike.name.split(' ');
  const model = rest.join(' ');
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    generator: 'search', gsrnamespace: '6', gsrlimit: '20',
    gsrsearch: `intitle:"${model}" ${brand}`,
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1000',
  });
  const data = await (await fetch(url)).json();
  const list = Object.values(data.query?.pages ?? {})
    .sort((a, b) => a.index - b.index)
    .map((p) => ({ title: p.title, info: p.imageinfo?.[0] }))
    .filter(({ title, info }) => info && info.mime === 'image/jpeg' && info.width > info.height &&
      titleMatches(title.replace(/^File:/, ''), brand, model))
    .slice(0, 8)
    .map(({ info }) => ({
      src: info.thumburl ?? info.url,
      page: info.descriptionurl,
      credit: [plain(info.extmetadata?.Artist?.value).slice(0, 60) || 'Unbekannt',
        plain(info.extmetadata?.LicenseShortName?.value), 'Wikimedia Commons'].filter(Boolean).join(' · '),
    }));
  cache.set(bike.name, list);
  return list;
}
