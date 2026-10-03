import React from 'react';
import AuthPage from './components/AuthPage';
import LandingPage from './components/LandingPage';
import { getCurrentUser, logout } from './lib/auth';

const getScreen = () => {
  if (window.location.hash === '#login' || window.location.hash === '#signup') return 'auth';
  if (window.location.hash === '#dashboard') return 'dashboard';
  return 'landing';
};

const DashboardPage = ({ user, onLogout }) => (
  <main className="account-page">
    <nav className="account-nav">
      <a className="brand" href="#top"><span className="brand-mark" aria-hidden="true">T</span><span>trackwise</span></a>
      <button className="account-logout" onClick={onLogout} type="button">Sign out</button>
    </nav>
    <section className="account-card">
      <div className="account-success" aria-hidden="true">✓</div>
      <p className="auth-eyebrow">YOUR ACCOUNT</p>
      <h1>You’re signed in, {user.name.split(' ')[0]}.</h1>
      <p className="account-email">{user.email}</p>
      <div className="account-divider" />
      <p className="account-note">Your Trackwise account is ready. Your job search workspace is all yours.</p>
      <button className="auth-submit" onClick={onLogout} type="button">Sign out</button>
    </section>
  </main>
);

const App = () => {
  const [screen, setScreen] = React.useState(getScreen);
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    const handleHashChange = () => setScreen(getScreen());
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      active = false;
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const handleAuthenticated = (authenticatedUser) => {
    setUser(authenticatedUser);
    window.location.hash = 'dashboard';
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    window.location.hash = 'top';
  };

  if (loading) return <main className="app-loading" aria-label="Loading account" />;
  if (screen === 'auth' && !user) return <AuthPage initialMode={window.location.hash === '#signup' ? 'signup' : 'login'} onAuthenticated={handleAuthenticated} />;
  if (user) return <DashboardPage user={user} onLogout={handleLogout} />;
  return <LandingPage />;
};

export default App;
