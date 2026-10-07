const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const nodemailer = require('nodemailer');

const packageConfig = require('../package.json');
const passwordLength = { min: 8, max: 128 };
const jobStatuses = new Set(['Applied', 'Interview', 'Offer', 'Rejected', 'Withdrawn']);
const sessionDuration = 7 * 24 * 60 * 60 * 1000;
const passwordResetDuration = 30 * 60 * 1000;
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
  appOrigin = process.env.APP_ORIGIN || (production ? '' : 'http://localhost:3000'),
  sendRecoveryEmail: recoveryEmailSender = null,
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
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      position TEXT NOT NULL,
      job_url TEXT NOT NULL DEFAULT '',
      date_applied TEXT NOT NULL,
      status TEXT NOT NULL,
      interview_at TEXT NOT NULL DEFAULT '',
      job_description TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS password_resets_expiry_idx ON password_resets(expires_at);
    CREATE INDEX IF NOT EXISTS jobs_user_date_idx ON jobs(user_id, date_applied DESC);
  `);

  const jobColumns = database.pragma('table_info(jobs)');
  if (!jobColumns.some((column) => column.name === 'interview_at')) {
    database.exec("ALTER TABLE jobs ADD COLUMN interview_at TEXT NOT NULL DEFAULT ''");
  }

  const createResumesTable = `
    CREATE TABLE resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      pdf_data BLOB NOT NULL,
      uploaded_at INTEGER NOT NULL
    )
  `;
  const existingResumeColumns = database.pragma('table_info(resumes)');
  if (existingResumeColumns.length && !existingResumeColumns.some((column) => column.name === 'id')) {
    const migrateLegacyResume = database.transaction(() => {
      database.exec('ALTER TABLE resumes RENAME TO resumes_legacy');
      database.exec(createResumesTable);
      database.exec(`
        INSERT INTO resumes (user_id, file_name, file_size, pdf_data, uploaded_at)
        SELECT user_id, file_name, file_size, pdf_data, uploaded_at FROM resumes_legacy
      `);
      database.exec('DROP TABLE resumes_legacy');
    });
    migrateLegacyResume();
  } else if (!existingResumeColumns.length) {
    database.exec(createResumesTable);
  }
  database.exec('CREATE INDEX IF NOT EXISTS resumes_user_uploaded_idx ON resumes(user_id, uploaded_at DESC)');

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
  const deleteExpiredPasswordResets = database.prepare('DELETE FROM password_resets WHERE expires_at <= ?');
  const insertPasswordReset = database.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)');
  const findPasswordReset = database.prepare(`
    SELECT users.id, users.name, users.email
    FROM password_resets INNER JOIN users ON users.id = password_resets.user_id
    WHERE password_resets.token_hash = ? AND password_resets.expires_at > ?
  `);
  const deleteUserPasswordResets = database.prepare('DELETE FROM password_resets WHERE user_id = ?');
  const updatePassword = database.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?');
  const deleteUserSessions = database.prepare('DELETE FROM sessions WHERE user_id = ?');
  const jobFields = `id, company_name AS company, position, job_url AS jobUrl, date_applied AS dateApplied, status, interview_at AS interviewAt, job_description AS description, notes, created_at AS createdAt, updated_at AS updatedAt`;
  const listJobs = database.prepare(`SELECT ${jobFields} FROM jobs WHERE user_id = ? ORDER BY date_applied DESC, id DESC`);
  const findJob = database.prepare(`SELECT ${jobFields} FROM jobs WHERE id = ? AND user_id = ?`);
  const insertJob = database.prepare(`INSERT INTO jobs (user_id, company_name, position, job_url, date_applied, status, interview_at, job_description, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const updateJob = database.prepare(`UPDATE jobs SET company_name = ?, position = ?, job_url = ?, date_applied = ?, status = ?, interview_at = ?, job_description = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ?`);
  const deleteJob = database.prepare('DELETE FROM jobs WHERE id = ? AND user_id = ?');
  const resumeMetadataFields = 'id, file_name AS fileName, file_size AS fileSize, uploaded_at AS uploadedAt';
  const listResumes = database.prepare(`SELECT ${resumeMetadataFields} FROM resumes WHERE user_id = ? ORDER BY uploaded_at DESC, id DESC`);
  const findLatestResumeMetadata = database.prepare(`SELECT ${resumeMetadataFields} FROM resumes WHERE user_id = ? ORDER BY uploaded_at DESC, id DESC LIMIT 1`);
  const findResumeMetadataById = database.prepare(`SELECT ${resumeMetadataFields} FROM resumes WHERE id = ? AND user_id = ?`);
  const findResumeFile = database.prepare('SELECT file_name AS fileName, pdf_data AS pdfData FROM resumes WHERE id = ? AND user_id = ?');
  const findLatestResumeFile = database.prepare('SELECT file_name AS fileName, pdf_data AS pdfData FROM resumes WHERE user_id = ? ORDER BY uploaded_at DESC, id DESC LIMIT 1');
  const saveResume = database.prepare('INSERT INTO resumes (user_id, file_name, file_size, pdf_data, uploaded_at) VALUES (?, ?, ?, ?, ?)');
  const deleteResume = database.prepare('DELETE FROM resumes WHERE id = ? AND user_id = ?');
  const uploadResume = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
  });
  const handleResumeUpload = (request, response) => {
    const file = request.file;
    if (!file) return response.status(400).json({ error: 'Choose a PDF file to upload.' });
    if (file.mimetype !== 'application/pdf' || !file.originalname.toLowerCase().endsWith('.pdf') || file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return response.status(400).json({ error: 'The selected file must be a valid PDF.' });
    }

    const originalBaseName = path.basename(file.originalname.replace(/\\/g, '/'), path.extname(file.originalname));
    const safeBaseName = originalBaseName.replace(/[^A-Za-z0-9._ -]/g, '_').trim().slice(0, 100) || 'resume';
    const fileName = `${safeBaseName}.pdf`;
    const result = saveResume.run(request.user.id, fileName, file.size, file.buffer, Date.now());
    return response.status(201).json({ resume: findResumeMetadataById.get(Number(result.lastInsertRowid), request.user.id) });
  };
  const sendResumeFile = (request, response, inline, latest = false) => {
    let resume;
    if (latest) {
      resume = findLatestResumeFile.get(request.user.id);
    } else {
      const id = Number(request.params.id);
      if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: 'Choose a valid resume.' });
      resume = findResumeFile.get(id, request.user.id);
    }
    if (!resume) return response.status(404).json({ error: 'Resume not found.' });
    response.set('Cache-Control', 'private, no-store');
    response.type('application/pdf');
    if (inline) response.set('Content-Disposition', `inline; filename="${resume.fileName}"`);
    else response.attachment(resume.fileName);
    return response.send(resume.pdfData);
  };
  const replacePasswordReset = database.transaction((userId, tokenHash, expiresAt, createdAt) => {
    deleteUserPasswordResets.run(userId);
    insertPasswordReset.run(tokenHash, userId, expiresAt, createdAt);
  });
  const consumePasswordReset = database.transaction((tokenHash, salt, passwordHash, now) => {
    const reset = findPasswordReset.get(tokenHash, now);
    if (!reset) return null;
    updatePassword.run(salt, passwordHash, reset.id);
    deleteUserPasswordResets.run(reset.id);
    deleteUserSessions.run(reset.id);
    return findUserById.get(reset.id);
  });
  deleteExpiredSessions.run(Date.now());
  deleteExpiredPasswordResets.run(Date.now());

  const origin = appOrigin ? new URL(appOrigin) : null;
  if (origin && !['http:', 'https:'].includes(origin.protocol)) throw new Error('APP_ORIGIN must use HTTP or HTTPS.');
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM && Number.isInteger(smtpPort) && smtpPort > 0 && smtpPort <= 65535);
  const mailTransport = !recoveryEmailSender && smtpConfigured && origin
    ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : smtpPort === 465,
      auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    })
    : null;
  const deliverRecoveryEmail = recoveryEmailSender || (mailTransport
    ? ({ email, name, resetUrl }) => {
      const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]);
      return mailTransport.sendMail({
        from: process.env.SMTP_FROM,
        to: email,
        subject: 'Your Trackwise account details',
        text: `Hi ${name},\n\nYour Trackwise username is ${email}. Reset your password within 30 minutes using this link:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
        html: `<p>Hi ${escapeHtml(name)},</p><p>Your Trackwise username is <strong>${escapeHtml(email)}</strong>.</p><p><a href="${escapeHtml(resetUrl)}">Reset your password</a> within 30 minutes.</p><p>If you did not request this, you can ignore this email.</p>`,
      });
    }
    : null);

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

  const requireAuthentication = (request, response, next) => {
    const token = getSessionToken(request);
    const user = token ? findSessionUser.get(hashSessionToken(token), Date.now()) : null;
    if (!user) return response.status(401).json({ error: 'Not signed in.' });
    request.user = user;
    return next();
  };

  const normalizeJobInput = (body, current = {}) => {
    const value = (field, previous, maximum) => {
      const input = typeof body?.[field] === 'string' ? body[field].trim() : previous || '';
      return input.length <= maximum ? input : null;
    };
    const company = value('company', current.company, 160);
    const position = value('position', current.position, 160);
    const jobUrl = value('jobUrl', current.jobUrl, 2048);
    const dateApplied = value('dateApplied', current.dateApplied, 10);
    const interviewAt = value('interviewAt', current.interviewAt, 16);
    const description = value('description', current.description, 10000);
    const notes = value('notes', current.notes, 5000);
    const status = typeof body?.status === 'string' ? body.status : current.status || 'Applied';

    if (company === null || position === null || jobUrl === null || dateApplied === null || interviewAt === null || description === null || notes === null) {
      return { error: 'One or more fields exceed the allowed length.' };
    }
    if (!company || !position) return { error: 'Company and position are required.' };
    const parsedDate = new Date(`${dateApplied}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateApplied) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateApplied) {
      return { error: 'Enter a valid application date.' };
    }
    if (status === 'Interview') {
      const match = interviewAt.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/);
      if (!match) return { error: 'Enter the interview date and time.' };
      const interviewDate = new Date(`${match[1]}T00:00:00Z`);
      if (Number.isNaN(interviewDate.getTime()) || interviewDate.toISOString().slice(0, 10) !== match[1]) {
        return { error: 'Enter a valid interview date and time.' };
      }
    }
    if (jobUrl) {
      try {
        if (!['http:', 'https:'].includes(new URL(jobUrl).protocol)) throw new Error('Invalid protocol.');
      } catch {
        return { error: 'Enter a valid job posting URL.' };
      }
    }
    if (!jobStatuses.has(status)) return { error: 'Choose a valid application status.' };
    return { value: { company, position, jobUrl, dateApplied, status, interviewAt, description, notes } };
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

  app.post('/api/auth/recover', rateLimit(5), async (request, response, next) => {
    try {
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return response.status(400).json({ error: 'Enter a valid account email address.' });
      }
      if (!deliverRecoveryEmail || !origin) {
        const error = production
          ? 'Account recovery email is temporarily unavailable. Please try again later.'
          : 'Account recovery is not configured. Fill in the SMTP settings in .env and restart the server.';
        return response.status(503).json({ error });
      }

      const user = findUserByEmail.get(email);
      if (user) {
        const token = crypto.randomBytes(32).toString('base64url');
        const tokenHash = hashSessionToken(token);
        const now = Date.now();
        replacePasswordReset(user.id, tokenHash, now + passwordResetDuration, now);
        const resetUrl = new URL(`${basePath || ''}/`, origin.origin);
        resetUrl.hash = `reset/${token}`;
        try {
          await deliverRecoveryEmail({ email: user.email, name: user.name, resetUrl: resetUrl.toString() });
        } catch {
          console.error('Account recovery email failed to send.');
        }
      }

      return response.status(202).json({
        message: 'If an account uses that email as its username, we’ll send the username and password reset instructions.',
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/reset-password', rateLimit(12), async (request, response, next) => {
    try {
      const token = typeof request.body?.token === 'string' ? request.body.token : '';
      const password = typeof request.body?.password === 'string' ? request.body.password : '';
      if (!token || token.length > 256) return response.status(400).json({ error: 'This recovery link is invalid or expired. Request a new one.' });
      if (password.length < passwordLength.min || password.length > passwordLength.max) {
        return response.status(400).json({ error: `Password must be ${passwordLength.min}–${passwordLength.max} characters.` });
      }

      const tokenHash = hashSessionToken(token);
      if (!findPasswordReset.get(tokenHash, Date.now())) {
        return response.status(400).json({ error: 'This recovery link is invalid or expired. Request a new one.' });
      }
      const salt = crypto.randomBytes(16);
      const passwordHash = await derivePasswordHash(password, salt);
      const user = consumePasswordReset(tokenHash, salt.toString('base64'), passwordHash.toString('base64'), Date.now());
      if (!user) return response.status(400).json({ error: 'This recovery link is invalid or expired. Request a new one.' });
      createSession(user.id, response);
      return response.json({ user: safeUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/auth/me', requireAuthentication, (request, response) => response.json({ user: request.user }));

  app.post('/api/auth/logout', (request, response) => {
    const token = getSessionToken(request);
    if (token) deleteSession.run(hashSessionToken(token));
    const { httpOnly, secure, sameSite, path: cookiePath } = cookieOptions;
    response.clearCookie(sessionCookie, { httpOnly, secure, sameSite, path: cookiePath });
    return response.json({ ok: true });
  });

  app.get('/api/jobs', requireAuthentication, (request, response) => response.json({ jobs: listJobs.all(request.user.id) }));

  app.post('/api/jobs', requireAuthentication, (request, response) => {
    const { value, error } = normalizeJobInput(request.body);
    if (error) return response.status(400).json({ error });
    const now = Date.now();
    const result = insertJob.run(
      request.user.id,
      value.company,
      value.position,
      value.jobUrl,
      value.dateApplied,
      value.status,
      value.interviewAt,
      value.description,
      value.notes,
      now,
      now,
    );
    return response.status(201).json({ job: findJob.get(Number(result.lastInsertRowid), request.user.id) });
  });

  app.patch('/api/jobs/:id', requireAuthentication, (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: 'Choose a valid job.' });
    const current = findJob.get(id, request.user.id);
    if (!current) return response.status(404).json({ error: 'Job not found.' });
    const { value, error } = normalizeJobInput(request.body, current);
    if (error) return response.status(400).json({ error });
    updateJob.run(
      value.company,
      value.position,
      value.jobUrl,
      value.dateApplied,
      value.status,
      value.interviewAt,
      value.description,
      value.notes,
      Date.now(),
      id,
      request.user.id,
    );
    return response.json({ job: findJob.get(id, request.user.id) });
  });

  app.delete('/api/jobs/:id', requireAuthentication, (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: 'Choose a valid job.' });
    const result = deleteJob.run(id, request.user.id);
    if (!result.changes) return response.status(404).json({ error: 'Job not found.' });
    return response.json({ ok: true });
  });

  app.get('/api/resumes', requireAuthentication, (request, response) => {
    return response.json({ resumes: listResumes.all(request.user.id) });
  });

  app.post('/api/resumes', requireAuthentication, uploadResume.single('resume'), handleResumeUpload);
  app.get('/api/resumes/:id/view', requireAuthentication, (request, response) => sendResumeFile(request, response, true));
  app.get('/api/resumes/:id/download', requireAuthentication, (request, response) => sendResumeFile(request, response, false));
  app.delete('/api/resumes/:id', requireAuthentication, (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: 'Choose a valid resume.' });
    const result = deleteResume.run(id, request.user.id);
    if (!result.changes) return response.status(404).json({ error: 'Resume not found.' });
    return response.json({ ok: true });
  });

  app.get('/api/resume', requireAuthentication, (request, response) => {
    return response.json({ resume: findLatestResumeMetadata.get(request.user.id) || null });
  });
  app.post('/api/resume', requireAuthentication, uploadResume.single('resume'), handleResumeUpload);
  app.get('/api/resume/download', requireAuthentication, (request, response) => sendResumeFile(request, response, false, true));
  app.get('/api/resume/view', requireAuthentication, (request, response) => sendResumeFile(request, response, true, true));

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
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'Resume files must be 10 MB or smaller.' : 'Upload one PDF file at a time.';
      return response.status(status).json({ error: message });
    }
    if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'Request body must be valid JSON.' });
    console.error(error);
    return response.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    deleteExpiredSessions.run(now);
    deleteExpiredPasswordResets.run(now);
  }, 60 * 60 * 1000);
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
