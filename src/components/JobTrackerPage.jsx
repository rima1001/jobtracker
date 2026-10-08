import React from 'react';
import { createJob, deleteJob, getJobs, updateJob } from '../lib/jobs';
import './JobTrackerPage.css';

const statuses = ['Applied', 'Interview', 'Offer', 'Rejected', 'Withdrawn'];

const getToday = () => {
  const today = new Date();
  const localOffset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - localOffset).toISOString().slice(0, 10);
};

const formatInterviewAt = (value) => {
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime())
    ? value
    : parsedDate.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const splitInterviewAt = (value = '') => {
  const [date = '', time = ''] = value.split('T');
  return { date, time };
};

const updateInterviewAtPart = (value, part, nextValue) => {
  const current = splitInterviewAt(value);
  const date = part === 'date' ? nextValue : current.date;
  const time = part === 'time' ? nextValue : current.time;
  return date || time ? `${date}T${time}` : '';
};

const createEmptyJob = () => ({
  company: '',
  position: '',
  jobUrl: '',
  dateApplied: getToday(),
  status: 'Applied',
  interviewAt: '',
  description: '',
  notes: '',
});

const JobTrackerPage = ({ initialTab = 'jobs', user, onLogout }) => {
  const [jobs, setJobs] = React.useState([]);
  const [form, setForm] = React.useState(createEmptyJob);
  const [editingId, setEditingId] = React.useState(null);
  const [expandedJobs, setExpandedJobs] = React.useState(() => new Set());
  const [activeTab, setActiveTab] = React.useState(initialTab);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [updatingId, setUpdatingId] = React.useState(null);
  const [interviewCandidate, setInterviewCandidate] = React.useState(null);
  const [interviewAt, setInterviewAt] = React.useState('');
  const [interviewError, setInterviewError] = React.useState('');
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const formInterviewAt = splitInterviewAt(form.interviewAt);
  const dialogInterviewAt = splitInterviewAt(interviewAt);

  React.useEffect(() => {
    let active = true;
    getJobs()
      .then((loadedJobs) => {
        if (active) setJobs(loadedJobs);
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

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (editingId) {
        const updated = await updateJob(editingId, form);
        setJobs((current) => current.map((job) => job.id === updated.id ? updated : job));
        setMessage('Your job application has been updated.');
      } else {
        const created = await createJob(form);
        setJobs((current) => [created, ...current]);
        setMessage('Your job application has been added.');
      }
      setForm(createEmptyJob());
      setEditingId(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (job) => {
    setForm({
      company: job.company,
      position: job.position,
      jobUrl: job.jobUrl,
      dateApplied: job.dateApplied,
      status: job.status,
      interviewAt: job.interviewAt || '',
      description: job.description,
      notes: job.notes,
    });
    setEditingId(job.id);
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditing = () => {
    setForm(createEmptyJob());
    setEditingId(null);
    setError('');
    setMessage('');
  };

  const handleStatusChange = async (job, status) => {
    setError('');
    if (status === 'Interview') {
      setInterviewCandidate(job);
      setInterviewAt(job.interviewAt || '');
      setInterviewError('');
      return;
    }
    setUpdatingId(job.id);
    try {
      const updated = await updateJob(job.id, { status });
      setJobs((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleInterviewScheduleSubmit = async (event) => {
    event.preventDefault();
    if (!interviewCandidate) return;
    setUpdatingId(interviewCandidate.id);
    setInterviewError('');
    try {
      const updated = await updateJob(interviewCandidate.id, { status: 'Interview', interviewAt });
      setJobs((current) => current.map((item) => item.id === updated.id ? updated : item));
      setInterviewCandidate(null);
      setInterviewAt('');
      setMessage('Interview date and time saved.');
    } catch (requestError) {
      setInterviewError(requestError.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (job) => {
    if (!window.confirm(`Delete the ${job.position} application at ${job.company}?`)) return;
    setError('');
    try {
      await deleteJob(job.id);
      setJobs((current) => current.filter((item) => item.id !== job.id));
      if (editingId === job.id) cancelEditing();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const toggleExpanded = (id) => {
    setExpandedJobs((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="job-page">
      <header className="job-header">
        <div className="job-header-copy">
          <span className="job-brand-mark" aria-hidden="true">T</span>
          <h1>Job Application Helper</h1>
          <p>Keep track of your jobs and save your details in one place.</p>
        </div>
        <div className="job-header-actions">
          <a className="job-dashboard-link" href="#dashboard">Dashboard</a>
          <a className="job-dashboard-link" href="#resume">My Resume</a>
          <button className="job-signout" onClick={onLogout} type="button">Sign out</button>
        </div>
      </header>

      <nav className="job-tabs" aria-label="Your account pages">
        <button aria-current={activeTab === 'jobs' ? 'page' : undefined} className={activeTab === 'jobs' ? 'is-active' : ''} onClick={() => setActiveTab('jobs')} type="button">Job Tracker</button>
        <button aria-current={activeTab === 'profile' ? 'page' : undefined} className={activeTab === 'profile' ? 'is-active' : ''} onClick={() => setActiveTab('profile')} type="button">My Profile</button>
      </nav>

      {error && <p className="job-alert job-alert--error" role="alert">{error}</p>}
      {message && <p className="job-alert job-alert--success" role="status">{message}</p>}

      {activeTab === 'jobs' ? (
        <>
          <section className="job-panel" aria-labelledby="job-form-title">
            <div className="job-panel-heading">
              <div>
                <span className="job-section-kicker">YOUR NEXT OPPORTUNITY</span>
                <h2 id="job-form-title">{editingId ? 'Edit application' : 'Add a job'}</h2>
              </div>
              {editingId && <button className="job-cancel-edit" onClick={cancelEditing} type="button">Cancel edit</button>}
            </div>
            <form className="job-form" onSubmit={handleSubmit}>
              <div className="job-form-row">
                <label className="job-field">
                  <span>Company</span>
                  <input autoComplete="organization" maxLength="160" name="company" onChange={handleFieldChange} placeholder="Example: Bright Dental" required value={form.company} />
                </label>
                <label className="job-field">
                  <span>Position</span>
                  <input maxLength="160" name="position" onChange={handleFieldChange} placeholder="Example: Office assistant" required value={form.position} />
                </label>
              </div>
              <label className="job-field">
                <span>Job posting link <small>(optional)</small></span>
                <input maxLength="2048" name="jobUrl" onChange={handleFieldChange} placeholder="Paste the link here" type="url" value={form.jobUrl} />
              </label>
              <div className="job-form-row">
                <label className="job-field">
                  <span>Date applied</span>
                  <input name="dateApplied" onChange={handleFieldChange} required type="date" value={form.dateApplied} />
                </label>
                <label className="job-field">
                  <span>Status</span>
                  <select name="status" onChange={handleFieldChange} value={form.status}>
                    {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
              </div>
              {form.status === 'Interview' && (
                <div className="job-form-row interview-date-row">
                  <label className="job-field">
                    <span>Interview date</span>
                    <input onChange={(event) => setForm((current) => ({ ...current, interviewAt: updateInterviewAtPart(current.interviewAt, 'date', event.target.value) }))} required type="date" value={formInterviewAt.date} />
                  </label>
                  <label className="job-field">
                    <span>Interview time</span>
                    <input onChange={(event) => setForm((current) => ({ ...current, interviewAt: updateInterviewAtPart(current.interviewAt, 'time', event.target.value) }))} required type="time" value={formInterviewAt.time} />
                  </label>
                </div>
              )}
              <label className="job-field">
                <span>Job description <small>(optional)</small></span>
                <textarea maxLength="10000" name="description" onChange={handleFieldChange} placeholder="Copy the text from the job posting and paste it here" rows="4" value={form.description} />
              </label>
              <label className="job-field">
                <span>Notes <small>(optional)</small></span>
                <textarea maxLength="5000" name="notes" onChange={handleFieldChange} placeholder="Recruiter name, phone number, interview date, anything you want to remember" rows="2" value={form.notes} />
              </label>
              <button className="job-submit" disabled={saving} type="submit">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add job'}</button>
            </form>
          </section>

          <section className="job-panel job-list-panel" aria-labelledby="my-jobs-title">
            <div className="job-panel-heading job-list-heading">
              <div><span className="job-section-kicker">YOUR SEARCH AT A GLANCE</span><h2 id="my-jobs-title">My jobs <span className="job-count">{jobs.length}</span></h2></div>
            </div>
            {loading ? <p className="job-empty-state">Loading your applications…</p> : jobs.length === 0 ? (
              <div className="job-empty-state"><span aria-hidden="true">✳</span><strong>Your list starts here.</strong><p>Add your first opportunity above and keep your search organized.</p></div>
            ) : (
              <div className="job-list">
                {jobs.map((job) => {
                  const statusClass = job.status.toLowerCase();
                  const expanded = expandedJobs.has(job.id);
                  return (
                    <article className="job-item" key={job.id}>
                      <div className="job-item-topline">
                        <div className="job-item-title">
                          <h3>{job.position}</h3>
                          <p>{job.company} <span aria-hidden="true">·</span> applied {job.dateApplied}</p>
                          {job.status === 'Interview' && job.interviewAt && <p className="job-interview-time">Interview scheduled {formatInterviewAt(job.interviewAt)}</p>}
                        </div>
                        <select aria-label={`Status for ${job.position} at ${job.company}`} className={`job-status job-status--${statusClass}`} disabled={updatingId === job.id} onChange={(event) => handleStatusChange(job, event.target.value)} value={job.status}>
                          {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </div>
                      <div className="job-item-actions">
                        {job.jobUrl && <a href={job.jobUrl} rel="noopener noreferrer" target="_blank">View job posting ↗</a>}
                        <button onClick={() => startEditing(job)} type="button">Edit</button>
                        <button onClick={() => handleDelete(job)} type="button">Delete</button>
                      </div>
                      {(job.description || job.notes) && (
                        <>
                          <button aria-expanded={expanded} className="job-details-toggle" onClick={() => toggleExpanded(job.id)} type="button">{expanded ? 'Hide details −' : 'Show details +'}</button>
                          {expanded && (
                            <div className="job-details">
                              {job.description && <div><strong>Job description</strong><p>{job.description}</p></div>}
                              {job.notes && <div><strong>Notes</strong><p>{job.notes}</p></div>}
                            </div>
                          )}
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="job-panel profile-panel" aria-labelledby="profile-title">
          <span className="job-section-kicker">YOUR ACCOUNT</span>
          <h2 id="profile-title">My Profile</h2>
          <p className="profile-intro">Your profile is connected to the account you use to sign in.</p>
          <dl className="profile-details">
            <div><dt>Name</dt><dd>{user.name}</dd></div>
            <div><dt>Email / username</dt><dd>{user.email}</dd></div>
            <div><dt>Applications tracked</dt><dd>{jobs.length}</dd></div>
          </dl>
        </section>
      )}
      <footer className="job-footer"><span>Trackwise</span><span>Your next chapter, a little less complicated.</span></footer>
      {interviewCandidate && (
        <div className="job-dialog-backdrop">
          <section aria-labelledby="interview-dialog-title" aria-modal="true" className="job-interview-dialog" role="dialog">
            <span aria-hidden="true" className="interview-dialog-icon">◎</span>
            <h2 id="interview-dialog-title">Schedule the interview</h2>
            <p>{interviewCandidate.company} · {interviewCandidate.position}</p>
            <form onSubmit={handleInterviewScheduleSubmit}>
              <div className="job-form-row interview-date-row">
                <label className="job-field">
                  <span>Interview date</span>
                  <input autoFocus onChange={(event) => setInterviewAt((current) => updateInterviewAtPart(current, 'date', event.target.value))} required type="date" value={dialogInterviewAt.date} />
                </label>
                <label className="job-field">
                  <span>Interview time</span>
                  <input onChange={(event) => setInterviewAt((current) => updateInterviewAtPart(current, 'time', event.target.value))} required type="time" value={dialogInterviewAt.time} />
                </label>
              </div>
              {interviewError && <p className="job-dialog-error" role="alert">{interviewError}</p>}
              <div className="job-dialog-actions">
                <button className="job-dialog-cancel" disabled={updatingId === interviewCandidate.id} onClick={() => { setInterviewCandidate(null); setInterviewAt(''); setInterviewError(''); }} type="button">Cancel</button>
                <button className="job-dialog-save" disabled={updatingId === interviewCandidate.id || !interviewAt} type="submit">
                  {updatingId === interviewCandidate.id ? 'Saving…' : 'Save interview time'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
};

export default JobTrackerPage;
