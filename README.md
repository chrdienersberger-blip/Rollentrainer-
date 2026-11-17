# Ride More – Training und Bike-Fitting auf dem Rollentrainer

Web-App mit Startseite und drei Bereichen, erreichbar über die Menüleiste links:

- **Training:** Smart Trainer per Bluetooth (FTMS) verbinden und strukturierte
  Workouts im ERG-Modus oder Strecken mit simulierter Steigung fahren. Auswertung
  mit Normalized Power und TSS, Export als TCX. Ein Demo-Trainer erlaubt das
  Ausprobieren ohne Gerät.
- **Bike-Fitting:** Das Handy steht seitlich neben dem Rad, die App erkennt die
  Gelenke (MediaPipe Pose), misst die Winkel über viele Kurbelumdrehungen und gibt
  Empfehlungen zu Sattelhöhe, Sattelversatz, Cockpit-Höhe und Sitzlänge. Das Video
  der Messung lässt sich mit farbiger Umrandung wieder ansehen.
- **Marketplace:** Verzeichnis von Herstellern, Bekleidungsmarken und Händlern.

Videos und Messwerte werden ausschließlich im Browser auf dem Gerät verarbeitet.

Web-Bluetooth gibt es in Chrome und Edge (Android, Windows, macOS), nicht in
Safari auf iPhone und iPad.

## iPhone-App

Für Bluetooth auf dem iPhone gibt es eine App-Hülle. Einrichtung: siehe [APP.md](APP.md).

## Benutzen

Die App besteht nur aus statischen Dateien und braucht keinen Build-Schritt.
Der Kamerazugriff funktioniert nur über **https** (oder `localhost`).

**Über GitHub Pages:** im Repository unter *Settings → Pages* bei „Source“
*Deploy from a branch* wählen, Branch und Ordner `/ (root)` einstellen.
Danach ist die App unter `https://<benutzer>.github.io/<repo>/` erreichbar.

**Lokal:** `python3 -m http.server 8000` und `http://localhost:8000` öffnen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Oberfläche |
| `js/shell.js` | Menüleiste, Wechsel zwischen den Bereichen |
| `js/start.js` | Startseite mit Überblick über die Bereiche |
| `js/training.js` | Trainingsbereich: Übersicht, Fahrt, Auswertung |
| `js/trainer.js` | Bluetooth-Verbindung zum Trainer, Demo-Trainer |
| `js/ftms.js` | Trainer-Protokoll (FTMS, Leistungsmesser, Puls) |
| `js/world3d.js` | 3D-Welt der Strecken (WebGL) |
| `js/world.js` | Kurven der Strecken, einfache Ansicht ohne WebGL |
| `js/vendor/` | three.js (MIT-Lizenz, siehe `three.LICENSE`) |
| `js/strava.js` | Verbindung zu Strava, direkter Upload |
| `js/fit.js` | Export einer Fahrt als FIT-Datei |
| `js/workouts.js` | Workouts, Strecken, Fahrphysik, Kennzahlen, TCX |
| `js/market.js` | Marketplace-Verzeichnis |
| `js/app.js` | Bike-Fitting: Kamera, Pose-Erkennung, Ablauf, Anzeige |
| `js/analysis.js` | Winkelberechnung, Erkennung der Tretzyklen |
| `js/overlay.js` | Farbige Umrandung der Person im aufgezeichneten Video |
| `js/clips.js` | Ablage der Videos in der IndexedDB des Browsers |
| `js/evaluate.js` | Zielbereiche je Sitzziel, Punktzahl und Empfehlungstexte |
| `js/bikes.js` | Fahrradauswahl (Marke/Modell → Kategorie) |
| `js/hero.js` | Animierte Startgrafik (Fahrer und Rad-Silhouette je Typ) |
| `js/demo.js` | Gelenkmodell für Startgrafik, Demo und Tests |

## Tests

```
npm test
```

## Grenzen

Die Messgenauigkeit liegt bei etwa ±3–5°. Aus der Seitenansicht sind seitliche
Kniebewegungen und die Cleat-Stellung nicht erkennbar. Die Zielbereiche sind
Richtwerte und ersetzen kein professionelles Bikefitting.

## Strecken

- **Bekannte Anstiege** (Sa Calobra, Alpe d’Huez, Mont Ventoux): Länge und Höhenmeter
  entsprechen den üblichen Angaben, der Steigungsverlauf ist aus Kilometer-Mittelwerten
  angenähert. Es sind keine vermessenen GPS-Tracks.
- **Eigene Strecken:** Jede GPX-Datei lässt sich laden; daraus entstehen Höhenprofil
  und Kartenlinie.
- **Fahransicht:** Strecken werden als 3D-Welt aus der Verfolgerperspektive gezeigt
  (WebGL mit three.js): Gelände mit Detailstufen, Straße mit Markierung, Bäume, Felsen,
  Himmel, Sonnenlicht mit Schatten und ein tretender 3D-Fahrer. Die Straße folgt dem
  Höhenprofil; ihr Verlauf kommt bei GPX-Strecken aus dem Track, sonst ist er mit der
  passenden Zahl an Kehren nachgebildet. Die Landschaft drumherum ist erzeugt, nicht
  vermessen. Ohne WebGL gibt es eine einfache gezeichnete Ansicht.

## Strava und Garmin

- **Strava:** Direkter Upload über die offizielle Strava-API. Einmalig eine eigene API-App
  unter strava.com/settings/api anlegen (Callback-Domain = Domain dieser Seite) und Client ID
  und Secret in Training → Strava eintragen. Die Zugangsdaten bleiben im Speicher des Browsers.
  Nach dem Upload öffnet „In Strava öffnen“ die Aktivität (auf dem iPhone in der Strava-App).
- **Garmin Connect:** Garmin bietet keine offene Upload-Schnittstelle. Die Fahrt als FIT-Datei
  exportieren und über connect.garmin.com/modern/import-data importieren.

## Titelfoto

Die Startseite zeigt eine Zeichnung. Liegt im Projekt eine Datei `img/hero.jpg`
(Querformat, etwa 1600 × 1200 Pixel), wird stattdessen dieses Foto gezeigt.
Nur eigene oder ausdrücklich frei nutzbare Fotos verwenden.

## Versionen

Alle Programmteile werden mit `?v=N` geladen. Bei jeder Veröffentlichung muss N
überall gleichzeitig erhöht werden (in `index.html` und in den Importen unter
`js/`), sonst mischt der Browser alte und neue Dateien aus dem Zwischenspeicher.
