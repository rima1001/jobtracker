const basePath = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const jobsEndpoint = `${basePath}/api/jobs`;

const request = async (route = '', { method = 'GET', body } = {}) => {
  const response = await fetch(`${jobsEndpoint}${route}`, {
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not complete the request.');
  return result;
};

export const getJobs = () => request().then((result) => result.jobs);
export const createJob = (job) => request('', { method: 'POST', body: job }).then((result) => result.job);
export const updateJob = (id, changes) => request(`/${id}`, { method: 'PATCH', body: changes }).then((result) => result.job);
export const deleteJob = (id) => request(`/${id}`, { method: 'DELETE' });
