# Woodenbridge House Booking v3

## Avvio locale
```bash
npm install
npm start
```
Apri http://localhost:3000

Admin iniziale: `admin / woodenbridge2026` oppure variabili `ADMIN_USER` e `ADMIN_PASS`.

## Render + Persistent Disk
Usa un solo disco persistente:
- Mount Path: `/opt/render/project/src/data`
- Size: 1GB

Le foto vengono salvate in `data/uploads`, quindi non serve un disco separato per `uploads`.

## Email Gmail
Non mettere password vere nel codice o su GitHub. Su Render imposta Environment Variables:
- SMTP_HOST=smtp.gmail.com
- SMTP_PORT=587
- SMTP_USER=woodenbridgehouse@gmail.com
- SMTP_PASS=password per app Gmail
- SMTP_FROM=Woodenbridge House <woodenbridgehouse@gmail.com>

Per Gmail serve una Password per le app, non la password normale.
