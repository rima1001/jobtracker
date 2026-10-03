import React from 'react';
import './LandingPage.css';

const LandingPage = () => {
  return (
    <main className="landing-page">
      <div className="ambient-glow ambient-glow--top" aria-hidden="true" />
      <div className="ambient-glow ambient-glow--bottom" aria-hidden="true" />

      <nav className="site-nav" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Trackwise home">
          <span className="brand-mark" aria-hidden="true">T</span>
          <span>trackwise</span>
        </a>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#workflow">How it works</a>
          <a href="#login">Log in</a>
        </div>
        <a className="nav-cta" href="#signup">Get started <span aria-hidden="true">↗</span></a>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" /> YOUR NEXT CHAPTER STARTS HERE</div>
          <h1>Your job search,<br /><span>in good hands.</span></h1>
          <p className="hero-description">
            Less spreadsheet chaos. More forward motion. Keep every application, conversation, and next step in one clear place.
          </p>
          <div className="hero-actions" id="get-started">
            <a className="button button--primary" href="#signup">Create your account <span aria-hidden="true">→</span></a>
            <a className="text-link" href="#workflow">See how it works <span aria-hidden="true">↓</span></a>
          </div>
          <div className="social-proof">
            <div className="avatar-stack" aria-hidden="true"><span>J</span><span>M</span><span>A</span><span>+</span></div>
            <p><strong>A calmer way to job hunt.</strong><br />Built for your next big move.</p>
          </div>
        </div>

        <div className="dashboard" id="workflow" aria-label="Job search dashboard preview">
          <div className="dashboard-topbar">
            <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
            <span>YOUR JOB SEARCH</span>
            <span className="dashboard-menu" aria-hidden="true">•••</span>
          </div>
          <div className="dashboard-body">
            <div className="dashboard-heading">
              <div><span className="muted-label">MONDAY, OCTOBER 5</span><h2>Good morning, Alex <span aria-hidden="true">✳</span></h2></div>
              <span className="period-pill">This month⌄</span>
            </div>
            <div className="stats-grid">
              <div className="stat-card stat-card--highlight"><span>Applications</span><strong>24</strong><small><b>↗ 18%</b> vs. last month</small><div className="mini-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div></div>
              <div className="stat-card"><span>Interviews</span><strong>06</strong><small><b>↗ 2</b> this week</small><div className="interview-dots" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div></div>
            </div>
            <div className="applications-heading"><strong>Recent applications</strong><a href="#features">View all ↗</a></div>
            <div className="application-row"><span className="company-icon company-icon--violet">S</span><span className="company-name"><b>Stripe</b><small>Product Designer</small></span><span className="application-date">Oct 02</span><span className="application-status status--interview">Interview</span></div>
            <div className="application-row"><span className="company-icon company-icon--green">N</span><span className="company-name"><b>Notion</b><small>Design Engineer</small></span><span className="application-date">Oct 01</span><span className="application-status status--review">In review</span></div>
            <div className="application-row"><span className="company-icon company-icon--orange">F</span><span className="company-name"><b>Figma</b><small>Senior Designer</small></span><span className="application-date">Sep 28</span><span className="application-status status--applied">Applied</span></div>
          </div>
          <div className="floating-note"><span className="note-icon" aria-hidden="true">✦</span><span><b>You’ve got this.</b><small>One step at a time.</small></span><span className="note-check" aria-hidden="true">✓</span></div>
        </div>
      </section>

      <section className="features-section" id="features">
        <div className="section-intro"><span className="muted-label">A LITTLE MORE CLARITY</span><h2>Everything in its<br />right place.</h2></div>
        <div className="feature-grid">
          <article className="feature-card"><span className="feature-icon feature-icon--violet" aria-hidden="true">▦</span><h3>One home for every opportunity</h3><p>Save roles, track applications, and keep the details close—without another messy spreadsheet.</p><span className="feature-index">01</span></article>
          <article className="feature-card"><span className="feature-icon feature-icon--mint" aria-hidden="true">↗</span><h3>Know what’s next</h3><p>See your progress at a glance and keep follow-ups from slipping through the cracks.</p><span className="feature-index">02</span></article>
          <article className="feature-card"><span className="feature-icon feature-icon--peach" aria-hidden="true">✳</span><h3>Make room for the good part</h3><p>Spend less energy staying organized and more energy finding the right opportunity.</p><span className="feature-index">03</span></article>
        </div>
      </section>

      <footer className="site-footer"><a className="brand" href="#top"><span className="brand-mark" aria-hidden="true">T</span><span>trackwise</span></a><span>Your next chapter, a little less complicated.</span><a href="#top">Back to top ↑</a></footer>
    </main>
  );
};

export default LandingPage;
