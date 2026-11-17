#!/bin/bash
# Richtet die iPhone-App auf einem Mac ein und öffnet sie in Xcode.
# Aufruf im Projektordner:  bash scripts/ios-setup.sh
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then echo "Dieses Skript braucht einen Mac mit Xcode."; exit 1; fi
command -v xcodebuild >/dev/null || { echo "Xcode fehlt – bitte aus dem App Store installieren und einmal öffnen."; exit 1; }
command -v npm >/dev/null || { echo "Node.js fehlt – bitte von nodejs.org installieren."; exit 1; }

npm install
npm run app:build
[ -d ios ] || npx cap add ios
npx cap sync ios

# Berechtigungstexte, die das iPhone beim ersten Zugriff anzeigt
PLIST=ios/App/App/Info.plist
set_key() { /usr/libexec/PlistBuddy -c "Set :$1 $2" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :$1 string $2" "$PLIST"; }
set_key NSCameraUsageDescription "Die Kamera wird für den Bike-Fitting-Check gebraucht. Das Video bleibt auf deinem Gerät."
set_key NSBluetoothAlwaysUsageDescription "Bluetooth verbindet die App mit deinem Smart Trainer und deinem Herzfrequenz-Sensor."
set_key NSBluetoothPeripheralUsageDescription "Bluetooth verbindet die App mit deinem Smart Trainer und deinem Herzfrequenz-Sensor."

# App-Symbol (optional – scheitert das, bleibt das Standardsymbol)
npx --yes @capacitor/assets generate --ios --assetPath assets || echo "Hinweis: App-Symbol konnte nicht erzeugt werden – es bleibt das Standardsymbol."

npx cap open ios
echo "Xcode ist geöffnet. Weiter geht es mit Schritt 3 in APP.md."
