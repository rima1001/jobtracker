const basePath = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const authEndpoint = `${basePath}/api/auth`;

const request = async (path, body) => {
  const response = await fetch(`${authEndpoint}/${path}`, {
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not complete the request.');
  return result;
};

export const register = (details) => request('register', details).then((result) => result.user);
export const login = (details) => request('login', details).then((result) => result.user);
export const logout = () => request('logout', {});

export const getCurrentUser = async () => {
  try {
    const result = await request('me');
    return result.user;
  } catch (error) {
    if (error.message === 'Not signed in.') return null;
    throw error;
  }
};
