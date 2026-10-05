import React from 'react';
import { requestAccountRecovery, resetPassword } from '../lib/auth';
import './RecoveryPage.css';

const RecoveryPage = ({ resetToken, onAuthenticated }) => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmation, setConfirmation] = React.useState('');
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const isResetting = Boolean(resetToken);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (isResetting && password !== confirmation) {
      setError('Those passwords don’t match yet.');
      return;
    }

    setBusy(true);
    try {
      if (isResetting) {
        const user = await resetPassword({ token: resetToken, password });
        onAuthenticated(user);
      } else {
        const result = await requestAccountRecovery(email);
        setNotice(result.message);
      }
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
      <div className="auth-recovery-layout">
        <section className="auth-panel auth-recovery-panel" aria-labelledby="recovery-title">
          <p className="auth-eyebrow">{isResetting ? 'SECURE YOUR ACCOUNT' : 'ACCOUNT RECOVERY'}</p>
          <h2 id="recovery-title">{isResetting ? 'Choose a new password.' : 'Let’s get you back in.'}</h2>
          <p className="auth-subtitle">
            {isResetting
              ? 'Choose a new password for your Trackwise account.'
              : 'Your username is your account email. Enter it below and we’ll send your username and password reset instructions if it matches an account.'}
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {isResetting ? (
              <>
                <label className="auth-field">
                  <span>New password</span>
                  <input autoComplete="new-password" maxLength="128" minLength="8" onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required type="password" value={password} />
                </label>
                <label className="auth-field">
                  <span>Confirm new password</span>
                  <input autoComplete="new-password" maxLength="128" minLength="8" onChange={(event) => setConfirmation(event.target.value)} placeholder="Enter it again" required type="password" value={confirmation} />
                </label>
              </>
            ) : (
              <label className="auth-field">
                <span>Account email (your username)</span>
                <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" value={email} />
              </label>
            )}
            {error && <p className="auth-error" role="alert">{error}</p>}
            {notice && <p className="auth-recovery-notice" role="status">{notice}</p>}
            <button className="auth-submit" disabled={busy} type="submit">
              {busy ? 'Just a moment…' : isResetting ? 'Save new password' : 'Email me recovery instructions'} <span aria-hidden="true">→</span>
            </button>
          </form>
          <a className="auth-back" href="#login">← Back to log in</a>
        </section>
      </div>
    </main>
  );
};

export default RecoveryPage;
