# ioBroker Adapter

Der Adapter bringt jetzt eine typische Grundstruktur mit:

- `io-package.json` fuer Manifest und Default-Konfiguration
- `admin/jsonConfig.json` fuer die Adapter-Einstellungen in Admin
- API-Endpunkte fuer State Read/Write
- statische Auslieferung eines Web-Bundles unter `/smarthome-dashboard`

## Endpunkte

- `POST /smarthome-dashboard/api/states`
- `PUT /smarthome-dashboard/api/state`

## Web-Bundle

Standardmaessig wird aus `adapter/www` ausgeliefert. Alternativ kann in der Adapter-Konfiguration `webDir` auf einen anderen Build-Ordner zeigen.

## Noch offen fuer produktiv

- echtes Packaging/Publish als ioBroker-Adapter
- Authentifizierung und Rechtepruefung
- optional Push/Subscriptions statt Polling
- automatisierter Export des Expo-Web-Bundles in den Adapter
