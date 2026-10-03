# Trackwise

Trackwise is a React job-search tracker with SQLite-backed account registration and login.

## Run locally

```sh
npm install
npm start
```

The React app runs on port 3000 and proxies `/api` requests to the authentication server on port 4000. The account database is created at `data/jobtracker.sqlite` and is intentionally excluded from Git.

## Production

```sh
npm run build
npm run serve
```

Set `NODE_ENV=production` and serve the app behind HTTPS so session cookies are sent securely. Set `DATABASE_PATH` to choose a persistent SQLite file location; the default is `data/jobtracker.sqlite`.

Passwords are stored as salted scrypt hashes. Login sessions use random opaque tokens in `HttpOnly`, `SameSite=Lax` cookies; only token hashes are stored in SQLite. The built-in rate limit is process-local, so use a shared rate limiter and session/database strategy before deploying multiple application instances.
