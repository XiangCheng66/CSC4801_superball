import { useState } from 'react';
import { authApi } from '../../api/auth';

export default function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});

  function switchMode(nextMode) {
    setMode(nextMode);
    setError('');
    setFields({});
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const user = await authApi[mode](values);
      onAuthenticated(user);
    } catch (failure) {
      setError(failure.message);
      setFields(failure.fields || {});
    } finally {
      setBusy(false);
    }
  }

  const field = (name) => fields[name] && <span className="field-error">{[].concat(fields[name]).join(' ')}</span>;

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="tabs" aria-label="账号操作">
        <button type="button" className={mode === 'login' ? 'active' : ''} aria-pressed={mode === 'login'} disabled={busy} onClick={() => switchMode('login')}>登录</button>
        <button type="button" className={mode === 'register' ? 'active' : ''} aria-pressed={mode === 'register'} disabled={busy} onClick={() => switchMode('register')}>创建账号</button>
      </div>
      <h2 id="auth-title">{mode === 'login' ? '欢迎回来' : '开启新的机会'}</h2>
      <p className="muted">{mode === 'login' ? '登录后进入你的工作台。' : '选择你的身份，建立专属账号。'}</p>
      <form onSubmit={submit} key={mode}>
        <label>用户名<input name="username" autoComplete="username" minLength={3} maxLength={150} required disabled={busy} />{field('username')}</label>
        {mode === 'register' && <>
          <label>显示名称<input name="display_name" autoComplete="nickname" maxLength={100} disabled={busy} />{field('display_name')}</label>
          <label>邮箱<input name="email" type="email" autoComplete="email" maxLength={254} required disabled={busy} />{field('email')}</label>
          <label>身份<select name="role" aria-label="身份" defaultValue="Candidate" disabled={busy}><option value="Candidate">求职者 Candidate</option><option value="Employer">雇主 Employer</option></select>{field('role')}</label>
        </>}
        <label>密码<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} maxLength={128} required disabled={busy} />{field('password')}</label>
        {mode === 'register' && <p className="hint">至少 8 位，避免常见密码、纯数字和与账号相似的内容。</p>}
        {error && <div className="error" role="alert">{error}{field('non_field_errors')}</div>}
        <button className="primary" type="submit" disabled={busy}>{busy ? '正在处理…' : mode === 'login' ? '登录账号' : '创建账号并登录'}</button>
      </form>
      <p className="hint footer-hint">本地演示账号与启动方式见仓库 README。</p>
    </section>
  );
}
