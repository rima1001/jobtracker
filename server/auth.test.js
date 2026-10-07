const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { createServer } = require('node:http');
const Database = require('better-sqlite3');
const { createAuthApp } = require('./index');

let authApp;
let server;
let baseUrl;
let loginSessionCookie;
let secondAccountCookie;
const sentRecoveryEmails = [];
const appBasePath = '/rima1001/jobtracke';

before(async () => {
  sentRecoveryEmails.length = 0;
  authApp = createAuthApp({
    databasePath: ':memory:',
    basePath: appBasePath,
    production: false,
    sendRecoveryEmail: async (message) => sentRecoveryEmails.push(message),
  });
  server = createServer(authApp.app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  authApp.close();
});

const postJson = (route, payload, cookie) => fetch(`${baseUrl}${appBasePath}${route}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: JSON.stringify(payload),
});

const jobRequest = (method, route = '', payload, cookie) => fetch(`${baseUrl}${appBasePath}/api/jobs${route}`, {
  method,
  headers: { ...(payload ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
  body: payload ? JSON.stringify(payload) : undefined,
});

const resumeRequest = (method, route = '', cookie, body) => fetch(`${baseUrl}${appBasePath}/api/resumes${route}`, {
  method,
  headers: cookie ? { Cookie: cookie } : undefined,
  body,
});

test('registers an account, creates an authenticated session, and logs out', async () => {
  const registration = await postJson('/api/auth/register', {
    name: 'Alex Morgan',
    email: 'Alex@example.com',
    password: 'secure-passphrase',
  });
  assert.equal(registration.status, 200);
  const registered = await registration.json();
  assert.deepEqual(registered.user, { id: 1, name: 'Alex Morgan', email: 'alex@example.com' });
  assert.equal(Object.hasOwn(registered.user, 'password_hash'), false);

  const sessionCookie = registration.headers.get('set-cookie').split(';')[0];
  const setCookie = registration.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, new RegExp(`Path=${appBasePath.replaceAll('/', '\\/')}`));
  const currentUser = await fetch(`${baseUrl}${appBasePath}/api/auth/me`, { headers: { Cookie: sessionCookie } });
  assert.deepEqual((await currentUser.json()).user, registered.user);

  const logoutResponse = await postJson('/api/auth/logout', {}, sessionCookie);
  assert.equal(logoutResponse.status, 200);
  const afterLogout = await fetch(`${baseUrl}${appBasePath}/api/auth/me`, { headers: { Cookie: sessionCookie } });
  assert.equal(afterLogout.status, 401);
});

test('rejects invalid credentials without identifying which value was wrong', async () => {
  const response = await postJson('/api/auth/login', { email: 'unknown@example.com', password: 'wrong-password' });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Email or password is incorrect.' });
});

test('allows a user to sign in with the registered credentials', async () => {
  const response = await postJson('/api/auth/login', { email: ' ALEX@example.com ', password: 'secure-passphrase' });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).user, { id: 1, name: 'Alex Morgan', email: 'alex@example.com' });
  loginSessionCookie = response.headers.get('set-cookie').split(';')[0];
  assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
});

test('stores jobs per user and supports creating, updating, and deleting them', async () => {
  const unauthorized = await jobRequest('GET');
  assert.equal(unauthorized.status, 401);

  const createdResponse = await jobRequest('POST', '', {
    company: 'Bright Dental',
    position: 'Office assistant',
    jobUrl: 'https://example.com/jobs/office-assistant',
    dateApplied: '2026-10-01',
    status: 'Applied',
    description: 'Coordinate office scheduling.',
    notes: 'Follow up next week.',
  }, loginSessionCookie);
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).job;
  assert.equal(created.company, 'Bright Dental');
  assert.equal(created.position, 'Office assistant');

  const secondAccount = await postJson('/api/auth/register', {
    name: 'Taylor Reed',
    email: 'taylor@example.com',
    password: 'another-secure-passphrase',
  });
  assert.equal(secondAccount.status, 200);
  secondAccountCookie = secondAccount.headers.get('set-cookie').split(';')[0];
  const otherUserJobs = await jobRequest('GET', '', undefined, secondAccountCookie);
  assert.deepEqual((await otherUserJobs.json()).jobs, []);
  const cannotEditOtherJob = await jobRequest('PATCH', `/${created.id}`, { status: 'Interview' }, secondAccountCookie);
  assert.equal(cannotEditOtherJob.status, 404);

  const missingInterviewTime = await jobRequest('PATCH', `/${created.id}`, { status: 'Interview' }, loginSessionCookie);
  assert.equal(missingInterviewTime.status, 400);
  const updatedResponse = await jobRequest('PATCH', `/${created.id}`, {
    status: 'Interview',
    interviewAt: '2026-10-12T14:30',
  }, loginSessionCookie);
  assert.equal(updatedResponse.status, 200);
  const updatedJob = (await updatedResponse.json()).job;
  assert.equal(updatedJob.status, 'Interview');
  assert.equal(updatedJob.interviewAt, '2026-10-12T14:30');
  const deleted = await jobRequest('DELETE', `/${created.id}`, undefined, loginSessionCookie);
  assert.equal(deleted.status, 200);
  assert.deepEqual((await (await jobRequest('GET', '', undefined, loginSessionCookie)).json()).jobs, []);
});

test('attaches and downloads private PDF resumes per user', async () => {
  assert.equal((await resumeRequest('GET')).status, 401);
  const secondAccountResume = await resumeRequest('GET', '', secondAccountCookie);
  assert.deepEqual((await secondAccountResume.json()).resumes, []);

  const pdfBytes = Buffer.from('%PDF-1.7\nresume content\n%%EOF');
  const firstForm = new FormData();
  firstForm.append('resume', new Blob([pdfBytes], { type: 'application/pdf' }), 'alex-resume.pdf');
  const upload = await resumeRequest('POST', '', loginSessionCookie, firstForm);
  assert.equal(upload.status, 201);
  const storedResume = (await upload.json()).resume;
  assert.equal(storedResume.fileName, 'alex-resume.pdf');
  assert.equal(storedResume.fileSize, pdfBytes.length);

  const download = await resumeRequest('GET', `/${storedResume.id}/download`, loginSessionCookie);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /attachment/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdfBytes);
  const view = await resumeRequest('GET', `/${storedResume.id}/view`, loginSessionCookie);
  assert.equal(view.status, 200);
  assert.match(view.headers.get('content-disposition'), /inline/);
  assert.match(view.headers.get('content-type'), /application\/pdf/);
  assert.deepEqual(Buffer.from(await view.arrayBuffer()), pdfBytes);
  assert.equal((await resumeRequest('GET', `/${storedResume.id}/download`, secondAccountCookie)).status, 404);

  const invalidForm = new FormData();
  invalidForm.append('resume', new Blob(['not a PDF'], { type: 'text/plain' }), 'not-a-resume.txt');
  assert.equal((await resumeRequest('POST', '', loginSessionCookie, invalidForm)).status, 400);

  const anotherForm = new FormData();
  anotherForm.append('resume', new Blob([Buffer.from('%PDF-1.7\nsecond resume\n%%EOF')], { type: 'application/pdf' }), 'updated-resume.pdf');
  const anotherUpload = await resumeRequest('POST', '', loginSessionCookie, anotherForm);
  assert.equal(anotherUpload.status, 201);
  const secondResume = (await anotherUpload.json()).resume;
  assert.notEqual(secondResume.id, storedResume.id);
  const list = await resumeRequest('GET', '', loginSessionCookie);
  const listedResumes = (await list.json()).resumes;
  assert.equal(listedResumes.length, 2);
  assert.deepEqual(new Set(listedResumes.map((resume) => resume.fileName)), new Set(['alex-resume.pdf', 'updated-resume.pdf']));

  assert.equal((await resumeRequest('DELETE', `/${storedResume.id}`)).status, 401);
  assert.equal((await resumeRequest('DELETE', `/${secondResume.id}`, secondAccountCookie)).status, 404);
  assert.equal((await resumeRequest('DELETE', `/${storedResume.id}`, loginSessionCookie)).status, 200);
  const remaining = await resumeRequest('GET', '', loginSessionCookie);
  assert.deepEqual((await remaining.json()).resumes.map((resume) => resume.id), [secondResume.id]);
});

test('migrates existing single-resume accounts and preserves the uploaded PDF', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobtracker-resume-migration-'));
  const databasePath = path.join(directory, 'jobtracker.sqlite');
  const legacyDatabase = new Database(databasePath);
  legacyDatabase.pragma('foreign_keys = ON');
  legacyDatabase.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE resumes (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      pdf_data BLOB NOT NULL,
      uploaded_at INTEGER NOT NULL
    );
    CREATE TABLE jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      position TEXT NOT NULL,
      job_url TEXT NOT NULL DEFAULT '',
      date_applied TEXT NOT NULL,
      status TEXT NOT NULL,
      job_description TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  legacyDatabase.prepare('INSERT INTO users (name, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('Alex Morgan', 'alex@example.com', 'salt', 'hash', Date.now());
  legacyDatabase.prepare('INSERT INTO jobs (user_id, company_name, position, date_applied, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(1, 'Bright Dental', 'Office assistant', '2026-10-01', 'Applied', Date.now(), Date.now());
  const oldPdf = Buffer.from('%PDF-1.7\nexisting resume\n%%EOF');
  legacyDatabase.prepare('INSERT INTO resumes (user_id, file_name, file_size, pdf_data, uploaded_at) VALUES (?, ?, ?, ?, ?)')
    .run(1, 'existing-resume.pdf', oldPdf.length, oldPdf, Date.now());
  legacyDatabase.close();

  const upgradedApp = createAuthApp({ databasePath, basePath: appBasePath, production: false, appOrigin: '' });
  try {
    const migrated = upgradedApp.database.prepare('SELECT file_name, pdf_data FROM resumes WHERE user_id = ?').all(1);
    assert.equal(migrated.length, 1);
    assert.equal(migrated[0].file_name, 'existing-resume.pdf');
    assert.deepEqual(migrated[0].pdf_data, oldPdf);

    const migratedJob = upgradedApp.database.prepare('SELECT position, interview_at FROM jobs WHERE user_id = ?').get(1);
    assert.deepEqual(migratedJob, { position: 'Office assistant', interview_at: '' });

    upgradedApp.database.prepare('INSERT INTO resumes (user_id, file_name, file_size, pdf_data, uploaded_at) VALUES (?, ?, ?, ?, ?)')
      .run(1, 'second-resume.pdf', 5, Buffer.from('%PDF-'), Date.now());
    assert.equal(upgradedApp.database.prepare('SELECT COUNT(*) AS count FROM resumes WHERE user_id = ?').get(1).count, 2);
  } finally {
    upgradedApp.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('sends generic recovery instructions and consumes reset tokens once', async () => {
  const unknownAccount = await postJson('/api/auth/recover', { email: 'unknown@example.com' });
  assert.equal(unknownAccount.status, 202);
  const genericMessage = await unknownAccount.json();
  assert.match(genericMessage.message, /If an account uses that email/);
  assert.equal(sentRecoveryEmails.length, 0);

  const request = await postJson('/api/auth/recover', { email: ' ALEX@example.com ' });
  assert.equal(request.status, 202);
  assert.equal(sentRecoveryEmails.length, 1);
  assert.equal(sentRecoveryEmails[0].email, 'alex@example.com');
  const recoveryToken = new URL(sentRecoveryEmails[0].resetUrl).hash.slice('#reset/'.length);
  assert.ok(recoveryToken);
  const storedTokenHash = authApp.database.prepare('SELECT token_hash FROM password_resets').get().token_hash;
  assert.notEqual(storedTokenHash, recoveryToken);

  const reset = await postJson('/api/auth/reset-password', { token: recoveryToken, password: 'new-secure-passphrase' });
  assert.equal(reset.status, 200);
  assert.deepEqual((await reset.json()).user, { id: 1, name: 'Alex Morgan', email: 'alex@example.com' });
  assert.match(reset.headers.get('set-cookie'), /HttpOnly/i);

  const oldSession = await fetch(`${baseUrl}${appBasePath}/api/auth/me`, { headers: { Cookie: loginSessionCookie } });
  assert.equal(oldSession.status, 401);
  const reusedToken = await postJson('/api/auth/reset-password', { token: recoveryToken, password: 'another-secure-passphrase' });
  assert.equal(reusedToken.status, 400);

  const oldPassword = await postJson('/api/auth/login', { email: 'alex@example.com', password: 'secure-passphrase' });
  const newPassword = await postJson('/api/auth/login', { email: 'alex@example.com', password: 'new-secure-passphrase' });
  assert.equal(oldPassword.status, 401);
  assert.equal(newPassword.status, 200);
});

test('reports missing recovery mail configuration without sending or disclosing account state', async () => {
  const unconfiguredApp = createAuthApp({
    databasePath: ':memory:',
    basePath: appBasePath,
    production: false,
    appOrigin: '',
  });
  const unconfiguredServer = createServer(unconfiguredApp.app);
  await new Promise((resolve) => unconfiguredServer.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${unconfiguredServer.address().port}${appBasePath}/api/auth/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'person@example.com' }),
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /SMTP settings in \.env/);
  } finally {
    await new Promise((resolve, reject) => unconfiguredServer.close((error) => error ? reject(error) : resolve()));
    unconfiguredApp.close();
  }
});

test('rejects duplicate accounts and weak passwords', async () => {
  const duplicate = await postJson('/api/auth/register', {
    name: 'Another Alex',
    email: 'alex@EXAMPLE.com',
    password: 'secure-passphrase',
  });
  assert.equal(duplicate.status, 409);

  const weakPassword = await postJson('/api/auth/register', {
    name: 'Taylor',
    email: 'taylor@example.com',
    password: 'short',
  });
  assert.equal(weakPassword.status, 400);
});
