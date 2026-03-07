# SmartHome Dashboard for ioBroker

[![ioBroker](https://img.shields.io/badge/ioBroker-Ready-3399CC)](https://www.iobroker.net/)
[![Expo](https://img.shields.io/badge/Expo-Web%20UI-000020)](https://expo.dev/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-43853D)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Modular SmartHome dashboard adapter for ioBroker with a hosted React Native Web UI.
It combines state control, camera widgets, energy/solar widgets, dashboard pages, drag-and-drop layout editing, and configurable UI sounds.

## Highlights

- Widget-based dashboard with multi-page support
- Drag, resize, and cross-page widget move in layout mode
- Camera widget with per-view source selection:
  `snapshot`, `mjpeg`, `flv` (web)
- Dedicated energy and solar widgets
- Link widget with fullscreen in-dashboard overlay
- Configurable interaction sound system (per widget and page actions)
- Hosted web UI directly from the adapter (`/smarthome-dashboard`)
- Optional development proxy mode for live frontend iteration

## Screenshot Gallery

| Dashboard | Widget Editor | Camera Fullscreen |
|---|---|---|
| ![Dashboard](/docs/images/dashboard-overview.png) | ![Widget Editor](/docs/images/widget-editor.png) | ![Camera Fullscreen](/docs/images/camera-fullscreen.png) |

## Repository Structure

- `main.js` / `io-package.json` / `admin/jsonConfig.json`: adapter package root
- `adapter/main.js`: express server + API endpoints + web hosting/proxy
- `src/`: React Native Web dashboard application
- `adapter/www/`: exported production web bundle (must be committed for GitHub install)
- `assets/`: local widget assets and sound files

## Quick Start (Local Development)

```bash
npm install
npm run web
```

Run type checks:

```bash
npm run typecheck
```

## Build Web Bundle for Adapter

```bash
npm run export:web
```

This exports the static web app to `adapter/www`.

## Install Adapter from GitHub in ioBroker

After pushing your repository:

```bash
iobroker url "git+https://github.com/<user>/<repo>.git#main"
iobroker restart smarthome-dashboard.0
```

Important: always export and commit `adapter/www` before pushing a release commit.

## Live Development with Installed Adapter

You can keep the adapter installed and still iterate quickly on UI code.

1. Set adapter config `Dev server URL` (example: `http://192.168.1.50:8083`)
2. Start local web dev server:

```bash
npm run web
```

3. Open:
   `http://<iobroker-host>:8099/smarthome-dashboard`

In this mode:

- `/smarthome-dashboard/api/*` stays on adapter side
- UI requests are proxied to your local Expo dev server

## API Endpoints (Adapter)

- `GET /smarthome-dashboard/api/config`
- `PUT /smarthome-dashboard/api/config`
- `GET /smarthome-dashboard/api/dashboards`
- `GET /smarthome-dashboard/api/dashboards/:name`
- `PUT /smarthome-dashboard/api/dashboards/:name`
- `DELETE /smarthome-dashboard/api/dashboards/:name`
- `POST /smarthome-dashboard/api/states`
- `PUT /smarthome-dashboard/api/state`
- `POST /smarthome-dashboard/api/objects`
- `GET /smarthome-dashboard/api/images`
- `GET /smarthome-dashboard/api/camera-snapshot`
- `GET /smarthome-dashboard/api/camera-stream`

## Camera Notes

- `snapshot`: polling image URL with configurable refresh
- `mjpeg`: continuous stream via image tag / proxy
- `flv`: web-only playback via `flv.js`

If FLV shows `CodecUnsupported`, camera stream codec is usually not browser-compatible.
Use H.264-compatible stream variants (often sub/ext stream).

## Troubleshooting

- Black camera preview in web:
  verify URL reachability from ioBroker host, auth format, and camera session limits
- No sound:
  check `UI-Sounds` enabled, volume > 0, browser tab/device audio not muted
- No assets in image picker:
  make sure files are in `assets/` and re-export + redeploy adapter

## License

MIT
