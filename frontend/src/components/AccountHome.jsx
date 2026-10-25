import { useState } from 'react';
import { authApi } from '../api/auth';

export default function AccountHome({ user, onUserChanged, onLoggedOut }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function action(callback) {
    setBusy(true);
    setNotice('');
    setError('');
    try { await callback(); }
    catch (failure) {
      if (failure.status === 401) onLoggedOut();
      else setError(failure.message);
    } finally { setBusy(false); }
  }

  return (
    <section className="auth-card account-card" aria-labelledby="account-title">
      <span className="role-badge">{user.role === 'Candidate' ? '求职者' : '雇主'} · {user.role}</span>
      <h2 id="account-title">你好，{user.display_name || user.username}</h2>
      <p className="muted">账号已就绪，欢迎来到 Superball。</p>
      <dl className="account-details"><div><dt>用户名</dt><dd>{user.username}</dd></div><div><dt>邮箱</dt><dd>{user.email}</dd></div><div><dt>身份</dt><dd>{user.role}</dd></div></dl>
      <p className="hint">岗位、个人资料和面试功能正在分模块开发。本页提供已连接数据库的账号信息和会话操作。</p>
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="primary" disabled={busy} onClick={() => action(async () => { onUserChanged(await authApi.me()); setNotice('账号信息已刷新。'); })}>刷新账号信息</button>
        <button className="secondary" disabled={busy} onClick={() => action(async () => { await authApi.workspace(user.role); setNotice('当前身份权限检查通过。'); })}>检查身份权限</button>
        <button className="text-button" disabled={busy} onClick={() => action(async () => { await authApi.logout(); onLoggedOut(); })}>退出登录</button>
      </div>
    </section>
  );
}
