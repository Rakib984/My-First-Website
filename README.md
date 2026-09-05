# Rakib Hasan Bappy — Personal Website

A personal portfolio site with a small Node.js backend that powers the contact form.

## Structure

```
public/          Static frontend (index.html, 404.html)
server.js        Express server: serves the site and the contact API
data/            Stored contact messages (created automatically, not committed)
.env.example     Configuration template
```

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
cp .env.example .env   # optional, edit as needed
npm start
```

Then open http://localhost:3000.

For development with auto-reload: `npm run dev`.

## Contact form

Submissions go to `POST /api/contact` and are:

1. Validated (required fields, email format, length limits).
2. Filtered for bots with a hidden honeypot field and a per-IP rate limit (5 messages per 10 minutes).
3. Saved to `data/messages.json`.
4. Emailed to you if SMTP is configured (see below).

### Email notifications (optional)

Set these in `.env`:

| Variable      | Description                                        |
| ------------- | -------------------------------------------------- |
| `SMTP_HOST`   | SMTP server, e.g. `smtp.gmail.com`                 |
| `SMTP_PORT`   | Usually `465` (secure) or `587`                    |
| `SMTP_SECURE` | `true` for port 465, `false` for 587               |
| `SMTP_USER`   | SMTP login (your email address)                    |
| `SMTP_PASS`   | SMTP password or app password                      |
| `CONTACT_TO`  | Where to deliver messages (defaults to `SMTP_USER`)|

For Gmail, enable 2-step verification and create an App Password.

### Reading stored messages

Set `ADMIN_TOKEN` in `.env`, then:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/messages
```

## API

| Method | Path            | Description                                  |
| ------ | --------------- | -------------------------------------------- |
| GET    | `/api/health`   | Health check, reports whether email is enabled |
| POST   | `/api/contact`  | Submit a contact message (JSON or form data) |
| GET    | `/api/messages` | List stored messages (requires `ADMIN_TOKEN`) |

## Deploy

Any Node host works (Render, Railway, Fly.io, a VPS with PM2, etc.).
Set the start command to `npm start`, configure the environment variables above,
and make sure the `data/` directory is on persistent storage if you rely on stored messages.
