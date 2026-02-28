# SmartHome Dashboard

Expo-basierte React-Native-WebUI fuer ein modulares SmartHome-Dashboard mit:

- konfigurierbaren Widgets per JSON
- Grid-Layout mit Drag/Resize-Snapping
- ioBroker State Read/Write ueber Adapter-API-Endpunkte
- Kamera-Snapshots (mit Auto-Refresh) und RTSP-Links
- Energiefluss-Widget als Basis fuer PV-Daten

## Start

```bash
npm install
npm run web
```

Fuer den statischen Export in den ioBroker-Adapter:

```bash
npm run export:web
```

## Als ioBroker-Adapter von GitHub installieren

Dieses Repository ist jetzt am Root als ioBroker-Adapter vorbereitet:

- `package.json` am Root ist das Adapter-Paket
- `io-package.json` am Root enthaelt das Adapter-Manifest
- `main.js` am Root startet den Adapter
- das Web-Bundle wird aus `adapter/www` ausgeliefert

Wichtig vor dem Push:

```bash
npm run export:web
```

Danach `adapter/www` mit committen. Erst dann enthaelt das GitHub-Repo das auslieferbare Webinterface.

Installation in ioBroker:

1. Repository auf GitHub pushen
2. In ioBroker unter "Adapter" den GitHub-/Custom-URL-Install nutzen
3. Die GitHub-Repo-URL des Root-Repositories angeben

Wenn du das Repo spaeter in `iobroker.smarthome-dashboard` umbenennst, passt es auch namlich direkt zum Adapter-Paket.

## Live-Entwicklung mit installiertem Adapter

Du kannst den Adapter einmal in ioBroker installieren und danach die UI lokal weiterentwickeln, ohne jedes Mal `adapter/www` neu zu exportieren.

Vorgehen:

1. Adapter aus GitHub installieren
2. In der Adapter-Konfiguration `Dev server URL` setzen, z. B. `http://192.168.1.50:8083`
3. Lokal im Projekt `npm run web` starten
4. Im Browser oder auf dem ioBroker-Host `http://<iobroker-host>:8099/smarthome-dashboard` aufrufen

Dann passiert Folgendes:

- `/smarthome-dashboard/api/*` bleibt im Adapter und liest/schreibt echte ioBroker-States
- das UI selbst wird live an deinen Expo-Webserver weitergeleitet
- dadurch siehst du Design- und Logikänderungen direkt

Wichtig:

- Verwende bei `Dev server URL` eine Adresse, die vom ioBroker-Host erreichbar ist
- `localhost` funktioniert nur, wenn ioBroker und dein Dev-Server auf demselben Rechner laufen
- Wenn `Dev server URL` leer ist, liefert der Adapter wieder das statische Bundle aus `adapter/www`

## Erwartete ioBroker-Endpunkte

Die Frontend-App erwartet einen ioBroker-Adapter oder Reverse-Proxy mit diesen Endpunkten:

- `POST /smarthome-dashboard/api/states` mit `{ "stateIds": ["id1", "id2"] }`
- `PUT /smarthome-dashboard/api/state` mit `{ "stateId": "id1", "value": true }`

Antwort fuer `POST /states`:

```json
{
  "0_userdata.0.doors.front": false,
  "0_userdata.0.energy.pv": 4200
}
```

## Nächster Ausbau

Dein bestehendes PV-Dashboard kann spaeter als weiteres Widget oder als dedizierter Screen eingebunden werden. Die Grundstruktur dafuer ist vorhanden.
