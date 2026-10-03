const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const Database = require('better-sqlite3');

const packageConfig = require('../package.json');
const passwordLength = { min: 8, max: 128 };
const sessionDuration = 7 * 24 * 60 * 60 * 1000;
const sessionCookie = 'trackwise_session';
const scrypt = crypto.scrypt;

const defaultBasePath = new URL(packageConfig.homepage, 'http://localhost').pathname.replace(/\/$/, '');

const derivePasswordHash = (password, salt) => new Promise((resolve, reject) => {
  scrypt(password, salt, 64, (error, hash) => {
    if (error) reject(error);
    else resolve(hash);
  });
});

const hashSessionToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const safeUser = (user) => ({ id: user.id, name: user.name, email: user.email });

function createAuthApp({
  databasePath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'jobtracker.sqlite'),
  basePath = defaultBasePath,
  production = process.env.NODE_ENV === 'production',
} = {}) {
  if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  `);

  const findUserByEmail = database.prepare('SELECT * FROM users WHERE email = ?');
  const findUserById = database.prepare('SELECT id, name, email FROM users WHERE id = ?');
  const insertUser = database.prepare('INSERT INTO users (name, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)');
  const insertSession = database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
  const findSessionUser = database.prepare(`
    SELECT users.id, users.name, users.email
    FROM sessions INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `);
  const deleteSession = database.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const deleteExpiredSessions = database.prepare('DELETE FROM sessions WHERE expires_at <= ?');
  deleteExpiredSessions.run(Date.now());

  const app = express();
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    response.set('X-Content-Type-Options', 'nosniff');
    response.set('X-Frame-Options', 'DENY');
    response.set('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '16kb' }));

  if (basePath && basePath !== '/') {
    app.use((request, response, next) => {
      if (request.url === basePath) request.url = '/';
      else if (request.url.startsWith(`${basePath}/`)) request.url = request.url.slice(basePath.length);
      next();
    });
  }

  const attempts = new Map();
  const rateLimit = (limit) => (request, response, next) => {
    const now = Date.now();
    const key = `${request.ip}:${request.path}`;
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
      if (attempts.size > 10000) {
        for (const [attemptKey, attempt] of attempts) {
          if (attempt.resetAt <= now) attempts.delete(attemptKey);
        }
      }
      attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return next();
    }
    if (current.count >= limit) {
      response.set('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
      return response.status(429).json({ error: 'Too many attempts. Please try again later.' });
    }
    current.count += 1;
    if (attempts.size > 10000) {
      for (const [attemptKey, attempt] of attempts) {
        if (attempt.resetAt <= now) attempts.delete(attemptKey);
      }
    }
    return next();
  };

  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: basePath || '/',
    maxAge: sessionDuration,
  };

  const createSession = (userId, response) => {
    const token = crypto.randomBytes(32).toString('base64url');
    insertSession.run(hashSessionToken(token), userId, Date.now() + sessionDuration);
    response.cookie(sessionCookie, token, cookieOptions);
  };

  const getSessionToken = (request) => {
    const cookies = (request.headers.cookie || '').split(';');
    const session = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${sessionCookie}=`));
    return session ? session.slice(sessionCookie.length + 1) : null;
  };

  const createAccountResponse = (user, response) => {
    createSession(user.id, response);
    response.json({ user: safeUser(user) });
  };

  app.post('/api/auth/register', rateLimit(6), async (request, response, next) => {
    try {
      const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
      const password = typeof request.body?.password === 'string' ? request.body.password : '';

      if (name.length < 1 || name.length > 100) return response.status(400).json({ error: 'Enter a name of 1–100 characters.' });
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ error: 'Enter a valid email address.' });
      if (password.length < passwordLength.min || password.length > passwordLength.max) {
        return response.status(400).json({ error: `Password must be ${passwordLength.min}–${passwordLength.max} characters.` });
      }
      if (findUserByEmail.get(email)) return response.status(409).json({ error: 'An account with this email already exists. Try logging in.' });

      const salt = crypto.randomBytes(16);
      const passwordHash = await derivePasswordHash(password, salt);
      const result = insertUser.run(name, email, salt.toString('base64'), passwordHash.toString('base64'), Date.now());
      return createAccountResponse({ id: Number(result.lastInsertRowid), name, email }, response);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
      return next(error);
    }
  });

  app.post('/api/auth/login', rateLimit(12), async (request, response, next) => {
    try {
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
      const password = typeof request.body?.password === 'string' ? request.body.password : '';
      const user = findUserByEmail.get(email);
      const salt = user ? Buffer.from(user.password_salt, 'base64') : Buffer.alloc(16);
      const expectedHash = user ? Buffer.from(user.password_hash, 'base64') : Buffer.alloc(64);
      const actualHash = await derivePasswordHash(password, salt);
      const passwordMatches = crypto.timingSafeEqual(actualHash, expectedHash);

      if (!user || !passwordMatches) return response.status(401).json({ error: 'Email or password is incorrect.' });
      return createAccountResponse(user, response);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/auth/me', (request, response) => {
    const token = getSessionToken(request);
    if (!token) return response.status(401).json({ error: 'Not signed in.' });
    const user = findSessionUser.get(hashSessionToken(token), Date.now());
    if (!user) return response.status(401).json({ error: 'Not signed in.' });
    return response.json({ user });
  });

  app.post('/api/auth/logout', (request, response) => {
    const token = getSessionToken(request);
    if (token) deleteSession.run(hashSessionToken(token));
    const { httpOnly, secure, sameSite, path: cookiePath } = cookieOptions;
    response.clearCookie(sessionCookie, { httpOnly, secure, sameSite, path: cookiePath });
    return response.json({ ok: true });
  });

  if (production) {
    const buildDirectory = path.join(__dirname, '..', 'build');
    app.use(express.static(buildDirectory));
    app.get('*splat', (request, response, next) => {
      if (request.path.startsWith('/api/')) return next();
      return response.sendFile(path.join(buildDirectory, 'index.html'));
    });
  }

  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'Request body must be valid JSON.' });
    console.error(error);
    return response.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  const cleanupTimer = setInterval(() => deleteExpiredSessions.run(Date.now()), 60 * 60 * 1000);
  cleanupTimer.unref();

  return {
    app,
    close: () => {
      clearInterval(cleanupTimer);
      database.close();
    },
    database,
    findUserById,
  };
}

if (require.main === module) {
  const port = Number(process.env.API_PORT || process.env.PORT || 4000);
  const { app } = createAuthApp();
  app.listen(port, '0.0.0.0', () => {
    console.log(`Trackwise server listening on http://localhost:${port}`);
  });
}

module.exports = { createAuthApp };
