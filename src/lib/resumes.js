const basePath = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const resumesEndpoint = `${basePath}/api/resumes`;

const readResult = async (response) => {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not complete the request.');
  return result;
};

export const getResumes = () => fetch(resumesEndpoint, { credentials: 'same-origin' }).then(readResult).then((result) => result.resumes);

export const deleteResume = (id) => fetch(`${resumesEndpoint}/${id}`, {
  method: 'DELETE',
  credentials: 'same-origin',
}).then(readResult);

export const uploadResume = (file) => {
  const body = new FormData();
  body.append('resume', file);
  return fetch(resumesEndpoint, { method: 'POST', credentials: 'same-origin', body }).then(readResult).then((result) => result.resume);
};

export const getResumeDownloadUrl = (id) => `${resumesEndpoint}/${id}/download`;
export const getResumeViewUrl = (id) => `${resumesEndpoint}/${id}/view`;
