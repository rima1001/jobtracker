import React from 'react';
import { getJobs } from '../lib/jobs';
import './DashboardPage.css';

const dashboardStatuses = ['Applied', 'Interview', 'Offer', 'Rejected', 'Withdrawn'];

const DashboardPage = ({ user, onLogout }) => {
  const [jobs, setJobs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

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

  const interviews = jobs.filter((job) => job.status === 'Interview').length;
  const offers = jobs.filter((job) => job.status === 'Offer').length;
  const activeApplications = jobs.filter((job) => !['Rejected', 'Withdrawn'].includes(job.status)).length;

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <a className="brand" href="#top"><span className="brand-mark" aria-hidden="true">T</span><span>trackwise</span></a>
        <button className="dashboard-signout" onClick={onLogout} type="button">Sign out</button>
      </header>

      <nav className="dashboard-nav" aria-label="Your workspace">
        <a aria-current="page" className="is-active" href="#dashboard">Overview</a>
        <a href="#tracker">Job Tracker</a>
        <a href="#profile">My Profile</a>
      </nav>

      <section className="dashboard-welcome">
        <div>
          <span className="dashboard-eyebrow">YOUR JOB SEARCH</span>
          <h1>Welcome back, {user.name.split(' ')[0]}.</h1>
          <p>Here’s your application progress, all in one place.</p>
        </div>
        <a className="dashboard-add-button" href="#tracker"><span aria-hidden="true">＋</span> Add a job</a>
      </section>

      {error && <p className="dashboard-error" role="alert">{error}</p>}

      <section className="dashboard-metrics" aria-label="Application summary">
        <article className="dashboard-metric dashboard-metric--main">
          <span className="dashboard-metric-icon" aria-hidden="true">▦</span>
          <p>Total applications</p>
          <strong>{loading ? '—' : jobs.length}</strong>
          <small>Across your job search</small>
        </article>
        <article className="dashboard-metric">
          <span className="dashboard-metric-icon dashboard-metric-icon--violet" aria-hidden="true">◎</span>
          <p>Interviews</p>
          <strong>{loading ? '—' : interviews}</strong>
          <small>Conversations in progress</small>
        </article>
        <article className="dashboard-metric">
          <span className="dashboard-metric-icon dashboard-metric-icon--gold" aria-hidden="true">✳</span>
          <p>Offers</p>
          <strong>{loading ? '—' : offers}</strong>
          <small>New possibilities</small>
        </article>
        <article className="dashboard-metric">
          <span className="dashboard-metric-icon dashboard-metric-icon--blue" aria-hidden="true">↗</span>
          <p>Active applications</p>
          <strong>{loading ? '—' : activeApplications}</strong>
          <small>Still moving forward</small>
        </article>
      </section>

      <section className="dashboard-content-grid">
        <article className="dashboard-card dashboard-recent-card">
          <div className="dashboard-card-heading">
            <div><span className="dashboard-eyebrow">LATEST UPDATES</span><h2>Recent applications</h2></div>
            <a href="#tracker">View all <span aria-hidden="true">↗</span></a>
          </div>
          {loading ? <p className="dashboard-empty">Loading your applications…</p> : jobs.length === 0 ? (
            <div className="dashboard-empty-state">
              <span aria-hidden="true">✳</span>
              <strong>Your search starts here.</strong>
              <p>Add a job application to see your progress appear here.</p>
              <a href="#tracker">Add your first job <span aria-hidden="true">→</span></a>
            </div>
          ) : (
            <div className="dashboard-recent-list">
              {jobs.slice(0, 5).map((job) => (
                <div className="dashboard-recent-item" key={job.id}>
                  <span className="dashboard-company-mark" aria-hidden="true">{job.company.trim().charAt(0).toUpperCase()}</span>
                  <div className="dashboard-recent-copy">
                    <strong>{job.position}</strong>
                    <span>{job.company} <i aria-hidden="true">·</i> applied {job.dateApplied}</span>
                  </div>
                  <span className={`dashboard-status dashboard-status--${job.status.toLowerCase()}`}>{job.status}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <aside className="dashboard-card dashboard-status-card">
          <div className="dashboard-card-heading">
            <div><span className="dashboard-eyebrow">AT A GLANCE</span><h2>Application stages</h2></div>
          </div>
          {loading ? <p className="dashboard-empty">Loading stages…</p> : jobs.length === 0 ? (
            <p className="dashboard-status-empty">Your application stages will show here once you add a job.</p>
          ) : (
            <div className="dashboard-stage-list">
              {dashboardStatuses.map((status) => {
                const count = jobs.filter((job) => job.status === status).length;
                const share = jobs.length ? (count / jobs.length) * 100 : 0;
                return (
                  <div className="dashboard-stage" key={status}>
                    <div className="dashboard-stage-label"><span>{status}</span><strong>{count}</strong></div>
                    <div className="dashboard-stage-track"><span className={`dashboard-stage-fill dashboard-stage-fill--${status.toLowerCase()}`} style={{ width: `${share}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </section>

      <footer className="dashboard-footer"><span>Trackwise</span><span>Your next chapter, a little less complicated.</span></footer>
    </main>
  );
};

export default DashboardPage;
