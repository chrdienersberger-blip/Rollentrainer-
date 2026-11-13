# Rollentrainer – Sitzposition prüfen

Web-App, die per Handykamera die Sitzposition auf dem Rollentrainer analysiert.
Das Handy steht seitlich neben dem Rad, die App erkennt die Gelenke (MediaPipe Pose),
misst die Winkel über viele Kurbelumdrehungen und gibt Empfehlungen zu Sattelhöhe,
Sattelversatz, Lenkerhöhe und Sitzlänge.

Das Video wird ausschließlich im Browser auf dem Gerät verarbeitet.

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
| `js/app.js` | Kamera, Pose-Erkennung, Ablauf, Anzeige |
| `js/analysis.js` | Winkelberechnung, Erkennung der Tretzyklen |
| `js/evaluate.js` | Zielbereiche je Sitzziel, Punktzahl und Empfehlungstexte |
| `js/bikes.js` | Fahrradauswahl (Marke/Modell → Kategorie) |
| `js/photos.js` | Fotos der Räder (eigenes Foto oder Wikimedia Commons) |
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
