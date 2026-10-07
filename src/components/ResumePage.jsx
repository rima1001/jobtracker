import React from 'react';
import { deleteResume, getResumeViewUrl, getResumes, uploadResume } from '../lib/resumes';
import './ResumePage.css';

const maxResumeBytes = 10 * 1024 * 1024;

const formatBytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} MB`;

const ResumePage = ({ user, onLogout }) => {
  const [resumes, setResumes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [fileAction, setFileAction] = React.useState('');
  const [error, setError] = React.useState('');
  const [deleteCandidate, setDeleteCandidate] = React.useState(null);
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
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.pdf') || (selected.type && selected.type !== 'application/pdf')) {
      setError('Choose a PDF file.');
      event.target.value = '';
      return;
    }
    if (selected.size > maxResumeBytes) {
      setError('Resume files must be 10 MB or smaller.');
      event.target.value = '';
      return;
    }
    setUploading(true);
    setNotice(`Uploading ${selected.name}…`);
    try {
      const savedResume = await uploadResume(selected);
      setResumes((current) => [savedResume, ...current]);
      input.value = '';
      setNotice(`${selected.name} has been added to your resumes.`);
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

  const confirmDeleteResume = async () => {
    if (!deleteCandidate) return;
    const resume = deleteCandidate;
    setFileAction(`delete-${resume.id}`);
    setError('');
    try {
      await deleteResume(resume.id);
      setResumes((current) => current.filter((item) => item.id !== resume.id));
      setDeleteCandidate(null);
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
        <div className="resume-header-actions">
          <button className="resume-signout" onClick={onLogout} type="button">Sign out</button>
        </div>
      </header>

      <nav className="resume-nav" aria-label="Your workspace">
        <a href="#dashboard">Overview</a>
        <a href="#tracker">Job Tracker</a>
        <a aria-current="page" className="is-active" href="#resume">My Resume</a>
        <a href="#profile">My Profile</a>
      </nav>

      <section className="resume-content">
        <div className="resume-content-heading">
          <div>
            <span className="resume-eyebrow">YOUR CAREER MATERIALS</span>
            <h1>My Resume</h1>
          </div>
          <button className="resume-add-trigger" disabled={uploading} onClick={() => fileInput.current?.click()} type="button">
            {uploading ? 'Uploading…' : resumes.length ? 'Add another resume' : 'Add resume'} <span aria-hidden="true">＋</span>
          </button>
          <input aria-label="Choose a PDF resume" className="resume-file-input" accept=".pdf,application/pdf" disabled={uploading} onChange={handleFileChange} ref={fileInput} type="file" />
        </div>
        <p className="resume-intro">Keep multiple resume versions attached to your job search. Click a filename to open its PDF.</p>

        {error && <p className="resume-message resume-message--error" role="alert">{error}</p>}

        {loading ? <p className="resume-loading">Loading your resume…</p> : (
          <>
            <section aria-label="Uploaded resumes" className="resume-list">
              {resumes.length ? (
                resumes.map((resume) => (
                  <article className="resume-current-file" key={resume.id}>
                    <span aria-hidden="true" className="resume-file-icon">PDF</span>
                    <div className="resume-file-details">
                      <button className="resume-file-name" disabled={Boolean(fileAction)} onClick={() => handleOpenResume(resume)} type="button" title={`Open ${resume.fileName}`}>
                        {fileAction === `open-${resume.id}` ? 'Opening resume…' : resume.fileName}
                      </button>
                      <span>{formatBytes(resume.fileSize)} <i aria-hidden="true">·</i> Uploaded {new Date(resume.uploadedAt).toLocaleDateString()}</span>
                    </div>
                    <button aria-label={`Delete ${resume.fileName}`} className="resume-delete-button" disabled={Boolean(fileAction || deleteCandidate)} onClick={() => setDeleteCandidate(resume)} type="button">
                      Delete
                    </button>
                  </article>
                ))
              ) : (
                <div className="resume-empty-state">
                  <span aria-hidden="true">PDF</span>
                  <strong>No resumes attached yet</strong>
                  <p>Select <b>Add resume</b> above to choose a PDF. It uploads automatically.</p>
                </div>
              )}
            </section>
          </>
        )}
        <p className="resume-account-note">Signed in as {user.email}</p>
      </section>
      {deleteCandidate && (
        <div className="resume-dialog-backdrop">
          <section aria-labelledby="resume-delete-title" aria-modal="true" className="resume-delete-dialog" role="alertdialog">
            <span aria-hidden="true" className="resume-delete-warning">!</span>
            <h2 id="resume-delete-title">Delete this resume?</h2>
            <p><strong>{deleteCandidate.fileName}</strong> will be permanently removed from your account.</p>
            <div className="resume-delete-actions">
              <button className="resume-delete-cancel" disabled={Boolean(fileAction)} onClick={() => setDeleteCandidate(null)} type="button">Cancel</button>
              <button className="resume-delete-confirm" disabled={Boolean(fileAction)} onClick={confirmDeleteResume} type="button">
                {fileAction === `delete-${deleteCandidate.id}` ? 'Deleting…' : 'Delete resume'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

export default ResumePage;
