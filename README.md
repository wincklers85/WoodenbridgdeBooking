# Woodenbridge House Booking v2

Sito Node.js con calendario pubblico, registrazione clienti, codice verifica email, preventivi automatici, richieste prenotazione arancioni e conferma admin rossa.

## Avvio locale
```bash
npm install
npm start
```
Apri `http://localhost:3000`.

## Admin iniziale
- Utente: `admin`
- Password: `woodenbridge2026`

## Verifica email
Il sistema invia un codice se configuri SMTP tramite variabili ambiente:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE=true/false`
- `MAIL_FROM`

Senza SMTP, in locale mostra il codice a schermo per test.

## Deploy
Serve hosting Node.js con storage persistente o database. GitHub Pages non basta perché è statico/read-only.
