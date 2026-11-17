# Ride More als iPhone-App

Die Website läuft hier in einer App-Hülle. Dadurch darf sie auf dem iPhone direkt
per Bluetooth mit dem Smart Trainer und dem Herzfrequenz-Sensor sprechen – ohne
Spezial-Browser. Alles andere ist dieselbe App wie im Browser.

Diese Anleitung ist für die Nutzung auf dem eigenen iPhone gedacht, nicht für den
App Store.

## Was du brauchst

- einen **Mac** mit **Xcode** (kostenlos im Mac App Store; nach der Installation einmal öffnen)
- **Node.js** ab Version 22 (von nodejs.org)
- dein **iPhone** mit Kabel und deine **Apple-ID**
- das Projekt auf dem Mac (in GitHub: *Code → Download ZIP* und entpacken, oder per `git clone`)

Ein bezahltes Entwicklerkonto ist nicht nötig. Ohne es läuft die App jeweils
**sieben Tage** und muss danach neu aufgespielt werden (Schritt 5 wiederholen).
Mit dem Apple-Entwicklerprogramm (99 US-Dollar pro Jahr) hält sie ein Jahr.

## Schritte

1. **Terminal öffnen** und in den Projektordner wechseln, z. B. `cd ~/Downloads/Rollentrainer-`.
2. **Einrichten und Xcode öffnen:**

   ```
   bash scripts/ios-setup.sh
   ```

   Das Skript lädt die Bausteine, stellt die App zusammen und öffnet Xcode.
3. **iPhone anschließen** und am iPhone „Diesem Computer vertrauen“ bestätigen.
   Beim ersten Mal verlangt das iPhone den Entwicklermodus:
   *Einstellungen → Datenschutz & Sicherheit → Entwicklermodus* einschalten, neu starten.
4. **In Xcode anmelden:** links auf **App** klicken, dann den Reiter
   **Signing & Capabilities**. Bei **Team** deine Apple-ID wählen
   (*Add an Account…*, falls sie fehlt). Meldet Xcode, dass die Kennung vergeben ist,
   den **Bundle Identifier** ändern, z. B. in `app.ridemore.deinname`.
5. **Aufspielen:** oben in der Leiste dein iPhone als Ziel wählen und auf ▶ drücken.
6. **App erlauben:** Beim ersten Start am iPhone unter
   *Einstellungen → Allgemein → VPN & Geräteverwaltung* deiner Apple-ID vertrauen.
   Danach die App öffnen und die Fragen nach Bluetooth und Kamera erlauben.

## Nach einer Änderung an der App

```
git pull
npm run app:sync
```

Danach in Xcode wieder ▶ drücken.

## Aufbau

| Datei | Inhalt |
|---|---|
| `capacitor.config.json` | Name und Kennung der App |
| `app/native-ble.js` | Bluetooth über die Technik des iPhones |
| `scripts/build-app.mjs` | stellt die Web-Dateien in `www/` zusammen |
| `scripts/ios-setup.sh` | Einrichtung auf dem Mac |
| `ios/` | das Xcode-Projekt |
| `assets/` | Vorlage für das App-Symbol |

## Stand

Die App-Hülle und das Xcode-Projekt sind vorbereitet, die Web-Dateien lassen sich
zusammenstellen. Gebaut und auf einem iPhone getestet wurde die App noch nicht –
das geht nur auf einem Mac.
