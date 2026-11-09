import { useCallback, useEffect, useState } from 'react';
import { authApi } from './api/auth';
import AccountHome from './components/AccountHome';
import AuthPage from './pages/auth/AuthPage';
import CandidateWorkspace from './pages/candidate/CandidateWorkspace';
import EmployerDashboard from './pages/employer/EmployerDashboard';

export default function App() {
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
      <header className="site-header"><a className="brand" href="/" aria-label="Superball 首页"><span className="brand-mark">s</span>superball<span className="brand-dot">.</span></a><span className="course-label">CSC4801 · 招聘与求职</span></header>
      <main className={!loading && !error && user ? 'workspace-layout' : undefined}>
        {(!user || loading || error) && <section className="introduction"><p className="eyebrow">A BETTER MATCH, A NEW BEGINNING</p><h1>让每一份技能，<br />遇见合适的机会。</h1><p className="intro-copy">连接求职者与雇主。从建立账号开始，向下一段职业旅程出发。</p><div className="feature-list"><span>01 / 展示你的技能</span><span>02 / 发现匹配机会</span><span>03 / 安排下一次对话</span></div><div className="intro-note"><span className="small-dot" />为真实的连接，搭建可靠的起点。</div></section>}
        {loading ? <section className="auth-card"><p role="status">正在恢复会话…</p></section> : error ? <section className="auth-card"><h2>暂时无法连接</h2><p className="error" role="alert">{error}</p><button className="primary" onClick={() => setAttempt(attempt + 1)}>重新连接</button></section> : user?.role === 'Candidate' ? <CandidateWorkspace key={sessionVersion} user={user} onUserChanged={onUserChanged} onLoggedOut={onLoggedOut} /> : user?.role === 'Employer' ? <EmployerDashboard key={sessionVersion} user={user} onUserChanged={onUserChanged} onLoggedOut={onLoggedOut} /> : user ? <AccountHome key={sessionVersion} user={user} onUserChanged={onUserChanged} onLoggedOut={onLoggedOut} /> : <AuthPage onAuthenticated={onAuthenticated} />}
      </main>
      <footer className="site-footer"><span>Superball / Recruiting & Candidate Matching</span><span>以技能为起点，以机会为方向。</span></footer>
    </div>
  );
}
