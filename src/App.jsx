import React from 'react';
import AuthPage from './components/AuthPage';
import DashboardPage from './components/DashboardPage';
import JobTrackerPage from './components/JobTrackerPage';
import LandingPage from './components/LandingPage';
import RecoveryPage from './components/RecoveryPage';
import { getCurrentUser, logout } from './lib/auth';

const getScreen = () => {
  if (window.location.hash === '#login' || window.location.hash === '#signup') return 'auth';
  if (window.location.hash === '#recover' || window.location.hash.startsWith('#reset/')) return 'recovery';
  if (window.location.hash === '#dashboard') return 'dashboard';
  if (window.location.hash === '#tracker') return 'tracker';
  if (window.location.hash === '#profile') return 'profile';
  return 'landing';
};

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
  if (screen === 'recovery') {
    const resetToken = window.location.hash.startsWith('#reset/') ? window.location.hash.slice('#reset/'.length) : '';
    return <RecoveryPage resetToken={resetToken} onAuthenticated={handleAuthenticated} />;
  }
  if (['dashboard', 'tracker', 'profile'].includes(screen) && !user) {
    return <AuthPage initialMode="login" onAuthenticated={handleAuthenticated} />;
  }
  if (user && (screen === 'tracker' || screen === 'profile')) {
    return <JobTrackerPage key={screen} initialTab={screen === 'profile' ? 'profile' : 'jobs'} user={user} onLogout={handleLogout} />;
  }
  if (user) return <DashboardPage user={user} onLogout={handleLogout} />;
  return <LandingPage />;
};

export default App;
