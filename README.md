# Woodenbridge House

Sito con calendario disponibilità + pannello admin.

## Avvio locale
```bash
npm install
npm start
```
Apri `http://localhost:3000`.

## Login admin iniziale
- Utente: `admin`
- Password: `woodenbridge2026`

Cambia la password online usando variabili ambiente:
- `ADMIN_USER`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

## Deploy consigliato
Serve un hosting Node.js con storage persistente o database. GitHub Pages non basta perché è statico/read-only lato server.
