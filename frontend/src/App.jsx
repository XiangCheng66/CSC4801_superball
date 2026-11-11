import { useCallback, useEffect, useState } from 'react';
import { authApi } from './api/auth';
import AccountHome from './components/AccountHome';
import LanguageToggle from './i18n/LanguageToggle';
import { LanguageProvider, useI18n } from './i18n/LanguageProvider';
import AuthPage from './pages/auth/AuthPage';
import CandidateWorkspace from './pages/candidate/CandidateWorkspace';
import EmployerDashboard from './pages/employer/EmployerDashboard';

export default function App() {
  return (
    <LanguageProvider>
      <AppShell />
    </LanguageProvider>
  );
}

function AppShell() {
  const { t } = useI18n();
  const [{ user, sessionVersion }, setSession] = useState({ user: null, sessionVersion: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const onAuthenticated = useCallback((nextUser) => {
    setSession((current) => ({ user: nextUser, sessionVersion: current.sessionVersion + 1 }));
  }, []);
  // A request from a former workspace must not change a later session.
  const onLoggedOut = useCallback(() => {
    setSession((current) => current.sessionVersion === sessionVersion
      ? { user: null, sessionVersion: sessionVersion + 1 } : current);
  }, [sessionVersion]);
  const onUserChanged = useCallback((update) => {
    setSession((current) => {
      if (!current.user || current.sessionVersion !== sessionVersion) return current;
      const nextUser = typeof update === 'function' ? update(current.user) : update;
      const sameAccount = nextUser.id === current.user.id && nextUser.role === current.user.role;
      return { user: nextUser, sessionVersion: sameAccount ? sessionVersion : sessionVersion + 1 };
    });
  }, [sessionVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    authApi.me(controller.signal)
      .then((restoredUser) => { if (!controller.signal.aborted) onAuthenticated(restoredUser); })
      .catch((failure) => {
        if (!controller.signal.aborted && failure.name !== 'AbortError' && failure.status !== 401) setError(failure.message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, onAuthenticated]);

  return (
    <div className="shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label={t('app.brandHome')}><span className="brand-mark">s</span>superball<span className="brand-dot">.</span></a>
        <div className="header-meta">
          <span className="course-label">{t('app.courseLabel')}</span>
          <LanguageToggle />
        </div>
      </header>
      <main className={!loading && !error && user ? 'workspace-layout' : undefined}>
        {(!user || loading || error) && (
          <section className="introduction">
            <p className="eyebrow">A BETTER MATCH, A NEW BEGINNING</p>
            <h1>{t('app.introTitleLine1')}<br />{t('app.introTitleLine2')}</h1>
            <p className="intro-copy">{t('app.introCopy')}</p>
            <div className="feature-list"><span>{t('app.feature1')}</span><span>{t('app.feature2')}</span><span>{t('app.feature3')}</span></div>
            <div className="intro-note"><span className="small-dot" />{t('app.introNote')}</div>
          </section>
        )}
        {loading ? <section className="auth-card"><p role="status">{t('app.restoring')}</p></section>
          : error ? <section className="auth-card"><h2>{t('app.connectFailed')}</h2><p className="error" role="alert">{error}</p><button className="primary" onClick={() => setAttempt(attempt + 1)}>{t('app.retry')}</button></section>
            : user?.role === 'Candidate' ? <CandidateWorkspace key={sessionVersion} user={user} onUserChanged={onUserChanged} onLoggedOut={onLoggedOut} />
              : user?.role === 'Employer' ? <EmployerDashboard key={sessionVersion} user={user} onUserChanged={onUserChanged} onLoggedOut={onLoggedOut} />
                : user ? <AccountHome key={sessionVersion} user={user} onUserChanged={onUserChanged} onLoggedOut={onLoggedOut} />
                  : <AuthPage onAuthenticated={onAuthenticated} />}
      </main>
      <footer className="site-footer"><span>{t('app.footerLeft')}</span><span>{t('app.footerRight')}</span></footer>
    </div>
  );
}
