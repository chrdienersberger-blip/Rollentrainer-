// Videos der Messungen: liegen mit den Gelenkpunkten in der IndexedDB dieses Browsers.
// Nichts davon verlässt das Gerät.

const DB = 'rollentrainer', STORE = 'clips';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out?.result);
      t.onerror = t.onabort = () => reject(t.error);
    });
  } finally { db.close(); }
}

/** clip: { id, label, blob, frames, w, h } */
export const putClip = (clip) => tx('readwrite', (s) => s.put(clip));
export const getClip = (id) => tx('readonly', (s) => s.get(id)).catch(() => null);

/** Löscht alle Videos, deren id nicht in keepIds steht. */
export async function pruneClips(keepIds) {
  const keep = new Set(keepIds);
  const keys = (await tx('readonly', (s) => s.getAllKeys()).catch(() => [])) ?? [];
  const drop = keys.filter((k) => !keep.has(k));
  if (drop.length) await tx('readwrite', (s) => { drop.forEach((k) => s.delete(k)); }).catch(() => {});
}
