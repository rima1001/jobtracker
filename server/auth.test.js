const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createServer } = require('node:http');
const { createAuthApp } = require('./index');

let authApp;
let server;
let baseUrl;
let loginSessionCookie;
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
  const secondCookie = secondAccount.headers.get('set-cookie').split(';')[0];
  const otherUserJobs = await jobRequest('GET', '', undefined, secondCookie);
  assert.deepEqual((await otherUserJobs.json()).jobs, []);
  const cannotEditOtherJob = await jobRequest('PATCH', `/${created.id}`, { status: 'Interview' }, secondCookie);
  assert.equal(cannotEditOtherJob.status, 404);

  const updatedResponse = await jobRequest('PATCH', `/${created.id}`, { status: 'Interview' }, loginSessionCookie);
  assert.equal(updatedResponse.status, 200);
  assert.equal((await updatedResponse.json()).job.status, 'Interview');
  const deleted = await jobRequest('DELETE', `/${created.id}`, undefined, loginSessionCookie);
  assert.equal(deleted.status, 200);
  assert.deepEqual((await (await jobRequest('GET', '', undefined, loginSessionCookie)).json()).jobs, []);
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
