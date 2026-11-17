# Ride More als iPhone-App

Die Website läuft hier in einer App-Hülle. Dadurch darf sie auf dem iPhone direkt
per Bluetooth mit dem Smart Trainer und dem Herzfrequenz-Sensor sprechen – ohne
Spezial-Browser. Alles andere ist dieselbe App wie im Browser.

Diese Anleitung ist für die Nutzung auf dem eigenen iPhone gedacht, nicht für den
App Store.

## Welcher Weg?

| Weg | Kosten | Bluetooth (Trainer, Puls) | Was du brauchst | Haltbarkeit |
|---|---|---|---|---|
| **A: Zum Home-Bildschirm** | kostenlos | nein | nur das iPhone | dauerhaft |
| **B: Fertige App ohne Mac** (empfohlen) | kostenlos | ja | Windows-PC oder Mac, Kabel, Apple-ID | 7 Tage, dann neu aufspielen |
| **C: Selbst bauen mit Mac** | kostenlos | ja | Mac mit Xcode | 7 Tage, dann neu aufspielen |
| **D: Apple-Entwicklerprogramm** | 99 € pro Jahr | ja | Apple-ID | 1 Jahr bzw. TestFlight 90 Tage |

Die 7 Tage sind eine Grenze von Apple für kostenlose Apple-IDs: Danach startet die App
nicht mehr, bis man sie neu aufspielt (dauert eine Minute, Daten bleiben erhalten).

## Weg A: Zum Home-Bildschirm

Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“. Läuft wie eine App, aber ohne
Bluetooth – Trainer und Pulsgurt lassen sich so nicht verbinden.

## Weg B: Fertige App ohne Mac (Sideloadly)

GitHub baut die App bei jeder Änderung automatisch auf einem Mac (kostenlos, weil das
Repository öffentlich ist). Du lädst nur die fertige Datei herunter und spielst sie auf.

1. Auf GitHub im Repository auf **Actions** → **iPhone-App bauen** → den obersten grünen
   Lauf öffnen und unten unter **Artifacts** „RideMore-ipa“ herunterladen und entpacken
   (darin liegt `RideMore.ipa`). Dafür musst du bei GitHub angemeldet sein.
2. Auf dem PC **iTunes** (Windows, aus dem Microsoft Store oder von apple.com) bzw. am Mac
   nichts weiter installieren. Dann **Sideloadly** von sideloadly.io installieren (kostenlos).
3. iPhone per Kabel anschließen, am iPhone „Vertrauen“ tippen.
4. In Sideloadly die `RideMore.ipa` hineinziehen, deine Apple-ID eintragen, **Start**.
   Sideloadly fragt einmal nach dem Passwort bzw. einem Bestätigungscode.
5. Am iPhone: *Einstellungen → Allgemein → VPN & Geräteverwaltung* → deine Apple-ID →
   **Vertrauen**. Ab iOS 16 zusätzlich *Einstellungen → Datenschutz & Sicherheit →
   Entwicklermodus* einschalten und neu starten.
6. Ride More öffnen, Bluetooth und Kamera erlauben.

Nach 7 Tagen Schritt 3–4 wiederholen. Tipp: Lege für Sideloadly am besten eine zweite,
eigene Apple-ID an, statt deine Haupt-Apple-ID einzugeben.

## Weg C: Selbst bauen mit Mac

### Was du brauchst

- einen **Mac** mit **Xcode** (kostenlos im Mac App Store; nach der Installation einmal öffnen)
- **Node.js** ab Version 22 (von nodejs.org)
- dein **iPhone** mit Kabel und deine **Apple-ID**
- das Projekt auf dem Mac (in GitHub: *Code → Download ZIP* und entpacken, oder per `git clone`)

Ein bezahltes Entwicklerkonto ist nicht nötig. Ohne es läuft die App jeweils
**sieben Tage** und muss danach neu aufgespielt werden (Schritt 5 wiederholen).
Mit dem Apple-Entwicklerprogramm (99 US-Dollar pro Jahr) hält sie ein Jahr.

### Schritte

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

### Nach einer Änderung an der App

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

## Weg D: Apple-Entwicklerprogramm (99 € pro Jahr)

Mit der kostenpflichtigen Mitgliedschaft (developer.apple.com/programs) hält die App ein
Jahr, und sie lässt sich über TestFlight ohne Kabel installieren. Für eine reine Testphase
ist das nicht nötig.
