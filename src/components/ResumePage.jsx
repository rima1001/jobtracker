import React from 'react';
import { getResumeDownloadUrl, getResumeViewUrl, getResumes, uploadResume } from '../lib/resumes';
import './ResumePage.css';

const maxResumeBytes = 10 * 1024 * 1024;

const formatBytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} MB`;

const ResumePage = ({ user, onLogout }) => {
  const [resumes, setResumes] = React.useState([]);
  const [file, setFile] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [fileAction, setFileAction] = React.useState('');
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const fileInput = React.useRef(null);

  React.useEffect(() => {
    let active = true;
    getResumes()
      .then((currentResumes) => {
        if (active) setResumes(currentResumes);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleFileChange = async (event) => {
    const input = event.currentTarget;
    const selected = event.target.files?.[0] || null;
    setError('');
    setNotice('');
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.name.toLowerCase().endsWith('.pdf') || (selected.type && selected.type !== 'application/pdf')) {
      setError('Choose a PDF file.');
      event.target.value = '';
      setFile(null);
      return;
    }
    if (selected.size > maxResumeBytes) {
      setError('Resume files must be 10 MB or smaller.');
      event.target.value = '';
      setFile(null);
      return;
    }
    setFile(selected);
    setUploading(true);
    try {
      const savedResume = await uploadResume(selected);
      setResumes((current) => [savedResume, ...current]);
      setFile(null);
      input.value = '';
      setNotice('Your resume has been added securely to your account.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      input.value = '';
      setUploading(false);
    }
  };

  const fetchPdf = async (url) => {
    const response = await fetch(url, { credentials: 'same-origin' });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'The resume could not be loaded.');
    }
    if (!contentType.toLowerCase().includes('application/pdf')) {
      throw new Error('This site returned a web page instead of the PDF. Its resume backend may not be deployed yet.');
    }
    return response.blob();
  };

  const handleOpenResume = async (resume) => {
    const viewer = window.open('about:blank', '_blank');
    if (!viewer) {
      setError('Allow pop-ups to open your resume PDF.');
      return;
    }
    viewer.opener = null;
    setFileAction(`open-${resume.id}`);
    setError('');
    try {
      const pdf = await fetchPdf(getResumeViewUrl(resume.id));
      const pdfUrl = URL.createObjectURL(pdf);
      viewer.location.replace(pdfUrl);
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 5 * 60 * 1000);
    } catch (requestError) {
      viewer.close();
      setError(requestError.message);
    } finally {
      setFileAction('');
    }
  };

  const handleDownloadResume = async (resume) => {
    setFileAction(`download-${resume.id}`);
    setError('');
    try {
      const pdf = await fetchPdf(getResumeDownloadUrl(resume.id));
      const pdfUrl = URL.createObjectURL(pdf);
      const downloadLink = document.createElement('a');
      downloadLink.href = pdfUrl;
      downloadLink.download = resume.fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setFileAction('');
    }
  };

  return (
    <main className="resume-page">
      <header className="resume-header">
        <a className="brand" href="#top"><span className="brand-mark" aria-hidden="true">T</span><span>trackwise</span></a>
        <button className="resume-signout" onClick={onLogout} type="button">Sign out</button>
      </header>

      <nav className="resume-nav" aria-label="Your workspace">
        <a href="#dashboard">Overview</a>
        <a href="#tracker">Job Tracker</a>
        <a aria-current="page" className="is-active" href="#resume">My Resume</a>
        <a href="#profile">My Profile</a>
      </nav>

      <section className="resume-content">
        <span className="resume-eyebrow">YOUR CAREER MATERIALS</span>
        <h1>My Resume</h1>
        <p className="resume-intro">Keep multiple resume versions attached to your job search. Only you can access these files.</p>

        {error && <p className="resume-message resume-message--error" role="alert">{error}</p>}
        {notice && <p className="resume-message resume-message--success" role="status">{notice}</p>}

        {loading ? <p className="resume-loading">Loading your resume…</p> : (
          <>
            {resumes.length > 0 && (
              <section aria-label="Uploaded resumes" className="resume-list">
                {resumes.map((resume) => (
                  <article className="resume-current-file" key={resume.id}>
                    <span aria-hidden="true" className="resume-file-icon">PDF</span>
                    <div className="resume-file-details">
                      <button className="resume-file-name" disabled={Boolean(fileAction)} onClick={() => handleOpenResume(resume)} type="button" title={`Open ${resume.fileName}`}>
                        {fileAction === `open-${resume.id}` ? 'Opening resume…' : resume.fileName}
                      </button>
                      <span>{formatBytes(resume.fileSize)} <i aria-hidden="true">·</i> Uploaded {new Date(resume.uploadedAt).toLocaleDateString()}</span>
                    </div>
                    <button className="resume-download" disabled={Boolean(fileAction)} onClick={() => handleDownloadResume(resume)} type="button">
                      {fileAction === `download-${resume.id}` ? 'Downloading…' : 'Download PDF'}
                    </button>
                  </article>
                ))}
              </section>
            )}

            <section className="resume-upload-card">
              <div className="resume-upload-copy">
                <span className="resume-upload-symbol" aria-hidden="true">↑</span>
                <div>
              <button className="resume-add-trigger" disabled={uploading} onClick={() => fileInput.current?.click()} type="button">
                {resumes.length ? 'Add another resume' : 'Add your resume'} <span aria-hidden="true">＋</span>
              </button>
                  <p>Choose a PDF up to 10 MB. It uploads automatically.</p>
                </div>
              </div>
              <input aria-label="Choose a PDF resume" className="resume-file-input" accept=".pdf,application/pdf" disabled={uploading} onChange={handleFileChange} ref={fileInput} type="file" />
              {file && <p className="resume-selected-file"><span>{file.name}</span><small>{uploading ? 'Uploading…' : formatBytes(file.size)}</small></p>}
            </section>
          </>
        )}
        <p className="resume-account-note">Signed in as {user.email}</p>
      </section>
    </main>
  );
};

export default ResumePage;
