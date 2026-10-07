# Trackwise

Trackwise is a React job-search tracker with SQLite-backed account registration, login, and user-owned job applications.

## Run locally

```sh
npm install
npm start
```

The React app runs on port 3000 and proxies `/api` requests to the server on port 4000. The database at `data/jobtracker.sqlite` stores accounts, sessions, per-user job applications, and private resume files, and is intentionally excluded from Git.

The authenticated **My Resume** page allows each account to attach multiple PDFs, up to 10 MB each, and open or delete them later. Resume file bytes are stored in SQLite, existing single-resume uploads are migrated, and each file is accessible only to its owner.

## Production

```sh
npm run build
npm run serve
```

Set `NODE_ENV=production` and serve the app behind HTTPS so session cookies are sent securely. Set `DATABASE_PATH` to choose a persistent SQLite file location; the default is `data/jobtracker.sqlite`.

The account email is also the username. Account recovery sends that email address and a one-time password-reset link that expires after 30 minutes. To enable email locally, copy `.env.example` to `.env`, fill in your provider’s SMTP host, sender, and credentials, then restart `npm start`. Set `APP_ORIGIN` to the app origin; set `SMTP_USER` and `SMTP_PASSWORD` when the mail server requires authentication. `SMTP_SECURE=true` enables implicit TLS (otherwise port 465 enables it by default). Keep `.env` private and do not commit it. Recovery requests remain generic so they do not reveal whether an email has an account. Without mail configuration, recovery reports that setup is required rather than pretending an email was sent.

Passwords are stored as salted scrypt hashes. Login sessions use random opaque tokens in `HttpOnly`, `SameSite=Lax` cookies; only token hashes are stored in SQLite. The built-in rate limit is process-local, so use a shared rate limiter and session/database strategy before deploying multiple application instances.
