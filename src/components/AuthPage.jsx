import React from 'react';
import { login, register } from '../lib/auth';
import './AuthPage.css';

const AuthPage = ({ initialMode = 'login', onAuthenticated }) => {
  const [mode, setMode] = React.useState(initialMode);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const isSignup = mode === 'signup';

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    window.location.hash = nextMode;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const user = isSignup
        ? await register({ name, email, password })
        : await login({ email, password });
      onAuthenticated(user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-glow" aria-hidden="true" />
      <a className="brand auth-brand" href="#top"><span className="brand-mark" aria-hidden="true">T</span><span>trackwise</span></a>
      <div className="auth-layout">
        <section className="auth-story">
          <div className="auth-eyebrow"><span className="status-dot" /> A BETTER WAY FORWARD</div>
          <h1>Your next chapter<br />starts <span>with a plan.</span></h1>
          <p>Keep the busywork in one place, so you can focus on finding work that feels right.</p>
          <div className="auth-story-note"><span aria-hidden="true">✳</span><span><b>One step at a time.</b><small>Your search is going somewhere.</small></span></div>
        </section>

        <section className="auth-panel" aria-labelledby="auth-title">
          <div className="auth-switch" aria-label="Account access" role="group">
            <button aria-pressed={!isSignup} className={!isSignup ? 'is-active' : ''} onClick={() => switchMode('login')} type="button">Log in</button>
            <button aria-pressed={isSignup} className={isSignup ? 'is-active' : ''} onClick={() => switchMode('signup')} type="button">Create account</button>
          </div>
          <p className="auth-eyebrow">{isSignup ? 'A FRESH START' : 'WELCOME BACK'}</p>
          <h2 id="auth-title">{isSignup ? 'Make yourself at home.' : 'Good to have you back.'}</h2>
          <p className="auth-subtitle">{isSignup ? 'Set up your free account to get started.' : 'Sign in to pick up where you left off.'}</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignup && (
              <label className="auth-field">
                <span>Your name</span>
                <input autoComplete="name" maxLength="100" onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" required value={name} />
              </label>
            )}
            <label className="auth-field">
              <span>Email address</span>
              <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" value={email} />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <input autoComplete={isSignup ? 'new-password' : 'current-password'} maxLength="128" minLength={isSignup ? '8' : undefined} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'} required type="password" value={password} />
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" disabled={busy} type="submit">
              {busy ? 'Just a moment…' : isSignup ? 'Create your account' : 'Log in'} <span aria-hidden="true">→</span>
            </button>
          </form>

          <p className="auth-legal">By continuing, you agree to use Trackwise to manage your own job search.</p>
          <a className="auth-back" href="#top">← Back to Trackwise</a>
        </section>
      </div>
    </main>
  );
};

export default AuthPage;
