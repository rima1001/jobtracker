const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createServer } = require('node:http');
const { createAuthApp } = require('./index');

let authApp;
let server;
let baseUrl;
const appBasePath = '/rima1001/jobtracke';

before(async () => {
  authApp = createAuthApp({ databasePath: ':memory:', basePath: appBasePath, production: false });
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
  assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
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
