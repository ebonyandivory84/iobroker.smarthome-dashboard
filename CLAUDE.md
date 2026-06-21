# SmartHome Dashboard — Projektanweisungen

Erbt Regeln aus `projects/coding/CLAUDE.md`.

## Projektkontext
- **Ziel**: Modularer ioBroker-Adapter mit gehostem React Native Web Dashboard für Smarthome-Steuerung (Kamera, Energie, States)
- **Typ**: ioBroker Adapter + React Native Web Frontend, `visualization`, `daemon`, `compact: true`
- **Status**: v0.1.0, aktiv entwickelt
- **GitHub**: https://github.com/ebonyandivory84/iobroker.smarthome-dashboard
- **Auftraggeber**: Eigenprojekt

## Adapter-Metadaten (io-package.json)
- **Name**: `smarthome-dashboard`
- **Port**: `8109`, Dashboard erreichbar unter `/smarthome-dashboard`
- **LocalLink**: `%protocol%://%ip%:%port%/smarthome-dashboard`
- **Abhängigkeit**: `js-controller >= 5.0.0`
- **webDir**: `adapter/www`

## Repo-Struktur
```
SmartHome Dashboard/
├── App.tsx                      ← React Native Root-Komponente
├── index.js                     ← Expo-Einstiegspunkt
├── app.json / babel.config.js / tsconfig.json
├── package.json / package-lock.json
├── io-package.json
├── main.js                      ← ioBroker Adapter-Einstiegspunkt
├── src/                         ← React Native Web App (TypeScript 93.5%)
│   ├── components/              ← Widget-Komponenten
│   ├── context/                 ← React Context / State-Management
│   ├── hooks/                   ← Custom React Hooks
│   ├── screens/                 ← Dashboard-Seiten/Views
│   ├── services/                ← API-Services, ioBroker-Kommunikation
│   ├── types/                   ← TypeScript-Typdefinitionen
│   └── utils/                   ← Hilfsfunktionen
├── adapter/
│   └── www/                     ← Production Web-Bundle
│       ├── index.html
│       └── _expo/static/js/web/AppEntry-*.js
├── admin/
│   └── jsonConfig.json          ← Admin-UI: port, devServerUrl, enableDevProxy
├── assets/                      ← Widget-Assets, Sounds
├── docs/images/                 ← Screenshots
└── backups/recovery/            ← ioBroker-Backups (sollten aus Git raus)
```

⚠️ Zwei ioBroker-Backup-Archive liegen im Repo (`iobroker_2026_04_06-*.tar.gz`, `zigbee.0_2026_04_06-*.tar.gz`) — gehören in `.gitignore`.

## Features
- **Multi-Seiten-Dashboard**: Drag, Resize, seitenübergreifende Widget-Bewegung
- **Kamera-Widget**: `snapshot`, `mjpeg`, `flv`-Quellen
- **Energie-/Solar-Widgets**: PV, Verbrauch, Batterie visualisieren
- **Link-Widget**: Fullscreen-Overlay
- **Sound-System**: konfigurierbar pro Widget und pro Seite
- **State-Steuerung**: lesen + schreiben von ioBroker-States direkt aus dem Dashboard

## API-Endpunkte (main.js)
| Kategorie | Endpunkt |
|---|---|
| Konfiguration | `GET/POST /api/config` |
| Dashboards | CRUD: `GET/POST/PUT/DELETE /api/dashboards/:id` |
| ioBroker-States | `GET /api/states/:id`, `POST /api/states/:id` |
| ioBroker-Objekte | `GET /api/objects` |
| Bilder | `GET /api/images/:id` |
| Kamera Snapshot | `GET /api/camera-snapshot` |
| Kamera Stream | `GET /api/camera-stream` |

## Admin-Konfigurationsfelder
| Feld | Bedeutung |
|---|---|
| `port` | HTTP-Port (Standard: `8109`) |
| `devServerUrl` | URL des lokalen Expo-Dev-Servers (leer = Production) |
| `enableDevProxy` | Dev-Proxy aktivieren |

## Dev-Workflow
```bash
# Frontend entwickeln:
npm run web                         # Expo Dev-Server starten
# → devServerUrl im ioBroker-Admin auf http://localhost:<port> setzen
# Adapter proxied UI-Requests an Dev-Server, API-Calls bleiben auf Adapter

# Production-Build:
npm run build:web                   # Expo Web-Build → dist/
cp -R dist/. adapter/www/
iobroker restart smarthome-dashboard
```

## Graphify
- Aktiv auf `src/` (code-only, kein API-Key nötig)
- Graph-Output: `.graphify/` (gitignored)
- Ergebnis: 789 Nodes, 1551 Edges, 30 Communities
- Befehl: `graphify src/`

## Verbundene Projekte
- **go-e Adapter** → Energie/Ladestatus-States im Dashboard
- **EKD Solar** → PV/Batterie-States im Dashboard
- **AlarmSystem** → Alarm-States über Dashboard steuerbar

## Zuständige Skills
| Aufgabe | Tool |
|---|---|
| React Native / TypeScript | `ecc:react-reviewer` |
| TypeScript generell | `ecc:typescript-reviewer` |
| Build-Fehler (Expo/Vite) | `ecc:react-build` |
| Struktur visualisieren | `graphify src/` |
| Architekturentscheidungen | `ecc:architect` |

## Wichtige Entscheidungen
- `2026-06-21` — Graphify auf `src/` (nicht `./`; Backup-Dateien + Docs schließen API-Key ein)
