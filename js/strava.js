// Direkter Upload zu Strava über die offizielle Schnittstelle (OAuth + Upload-API).
// Voraussetzung: eine eigene „API-App“ im Strava-Konto (strava.com/settings/api). Client-ID und
// Client-Secret trägt man einmal in Ride More ein; sie bleiben nur im Speicher dieses Browsers.

const KEY = 'rollentrainer.strava.v1';
const PENDING = 'rollentrainer.strava.pending';
const AUTH = 'https://www.strava.com/oauth/authorize';
const TOKEN = 'https://www.strava.com/oauth/token';
const API = 'https://www.strava.com/api/v3';

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* optional */ } };

export const stravaState = () => {
  const s = load();
  return { configured: !!(s.clientId && s.clientSecret), connected: !!s.refresh, athlete: s.athlete ?? null, auto: !!s.auto, clientId: s.clientId ?? '' };
};

export function saveCredentials(clientId, clientSecret) {
  const s = load();
  save({ ...s, clientId: String(clientId).trim(), clientSecret: String(clientSecret).trim() });
}
export function setAuto(on) { save({ ...load(), auto: !!on }); }
export function disconnect() {
  const s = load();
  save({ clientId: s.clientId, clientSecret: s.clientSecret, auto: s.auto });
}

/** Rücksprung-Adresse: diese Seite ohne #bereich und ohne ?parameter. */
export const redirectUri = () => `${location.origin}${location.pathname}`;

/** Zur Anmeldeseite von Strava; pendingRide = Fahrt, die danach gleich hochgeladen werden soll. */
export function connect(pendingRide = null) {
  const s = load();
  if (!s.clientId) throw new Error('Keine Client-ID eingetragen');
  try { if (pendingRide) localStorage.setItem(PENDING, String(pendingRide)); else localStorage.removeItem(PENDING); } catch { /* optional */ }
  const url = `${AUTH}?${new URLSearchParams({
    client_id: s.clientId, response_type: 'code', redirect_uri: redirectUri(),
    approval_prompt: 'auto', scope: 'read,activity:write', state: 'ridemore',
  })}`;
  location.assign(url);
}

async function tokenRequest(params) {
  const s = load();
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: s.clientId, client_secret: s.clientSecret, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data.message || `Strava hat die Anmeldung abgelehnt (${res.status})`);
  save({ ...s, access: data.access_token, refresh: data.refresh_token, expiresAt: data.expires_at, athlete: data.athlete ? { firstname: data.athlete.firstname, lastname: data.athlete.lastname } : s.athlete });
}

/** Nach der Rückkehr von Strava: Code gegen Zugang tauschen. Liefert { connected, pendingRide } oder null. */
export async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  if (q.get('state') !== 'ridemore' || (!q.get('code') && !q.get('error'))) return null;
  history.replaceState(null, '', `${redirectUri()}#training`);
  let pendingRide = null;
  try { pendingRide = Number(localStorage.getItem(PENDING)) || null; localStorage.removeItem(PENDING); } catch { /* optional */ }
  if (q.get('error')) return { connected: false, error: 'Die Verbindung mit Strava wurde abgebrochen.', pendingRide };
  const scope = q.get('scope') ?? '';
  if (!scope.includes('activity:write')) return { connected: false, error: 'Bitte bei Strava das Hochladen von Aktivitäten erlauben (Häkchen nicht entfernen).', pendingRide };
  try {
    await tokenRequest({ code: q.get('code'), grant_type: 'authorization_code' });
    return { connected: true, pendingRide };
  } catch (err) {
    return { connected: false, error: networkHint(err), pendingRide };
  }
}

async function accessToken() {
  const s = load();
  if (!s.refresh) throw new Error('Nicht mit Strava verbunden');
  if (!s.access || (s.expiresAt ?? 0) * 1000 < Date.now() + 60000) await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refresh });
  return load().access;
}

const networkHint = (err) => (err?.name === 'TypeError'
  ? 'Strava war nicht erreichbar oder hat die Anfrage aus dem Browser blockiert. Prüfe die Internetverbindung; klappt es weiterhin nicht, die Fahrt als FIT-Datei exportieren und bei Strava hochladen.'
  : err?.message ?? String(err));

/**
 * Fahrt hochladen und warten, bis Strava sie verarbeitet hat.
 * onStatus(text) meldet den Fortschritt. Liefert { activityId } (bei Doppelten die schon vorhandene).
 */
export async function uploadFit(bytes, { name, description, externalId }, onStatus = () => {}) {
  try {
    onStatus('Wird zu Strava hochgeladen …');
    const token = await accessToken();
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), `${externalId}.fit`);
    form.append('data_type', 'fit');
    form.append('name', name);
    form.append('description', description);
    form.append('trainer', '1');
    form.append('external_id', externalId);
    const res = await fetch(`${API}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    let up = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(up.message || `Upload abgelehnt (${res.status})`);
    // Strava verarbeitet die Datei im Hintergrund – nachfragen, bis die Aktivität da ist
    for (let i = 0; i < 20 && !up.activity_id && !up.error; i++) {
      onStatus('Strava verarbeitet die Fahrt …');
      await new Promise((r) => setTimeout(r, 1500));
      const poll = await fetch(`${API}/uploads/${up.id_str ?? up.id}`, { headers: { Authorization: `Bearer ${token}` } });
      up = await poll.json().catch(() => up);
    }
    if (up.error) {
      const dup = String(up.error).match(/duplicate of .*?(\d{5,})/i);
      if (dup) return { activityId: dup[1], duplicate: true };
      throw new Error(up.error);
    }
    if (!up.activity_id) throw new Error('Strava hat die Fahrt noch nicht fertig verarbeitet – sie erscheint gleich in deinem Konto.');
    return { activityId: String(up.activity_id) };
  } catch (err) {
    throw new Error(networkHint(err));
  }
}

/** Link zur Aktivität – öffnet auf dem iPhone die Strava-App, wenn sie installiert ist. */
export const activityUrl = (id) => `https://www.strava.com/activities/${id}`;
