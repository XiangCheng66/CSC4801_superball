import { useState } from 'react';
import { authApi } from '../../api/auth';
import { useI18n } from '../../i18n/LanguageProvider';

export default function AuthPage({ onAuthenticated }) {
  const { t } = useI18n();
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
      <div className="tabs" aria-label={t('auth.tabsLabel')}>
        <button type="button" className={mode === 'login' ? 'active' : ''} aria-pressed={mode === 'login'} disabled={busy} onClick={() => switchMode('login')}>{t('auth.login')}</button>
        <button type="button" className={mode === 'register' ? 'active' : ''} aria-pressed={mode === 'register'} disabled={busy} onClick={() => switchMode('register')}>{t('auth.register')}</button>
      </div>
      <h2 id="auth-title">{mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}</h2>
      <p className="muted">{mode === 'login' ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}</p>
      <form onSubmit={submit} key={mode}>
        <label>{t('auth.username')}<input name="username" autoComplete="username" minLength={3} maxLength={150} required disabled={busy} />{field('username')}</label>
        {mode === 'register' && <>
          <label>{t('auth.displayName')}<input name="display_name" autoComplete="nickname" maxLength={100} disabled={busy} />{field('display_name')}</label>
          <label>{t('auth.email')}<input name="email" type="email" autoComplete="email" maxLength={254} required disabled={busy} />{field('email')}</label>
          <label>{t('auth.role')}<select name="role" aria-label={t('auth.role')} defaultValue="Candidate" disabled={busy}><option value="Candidate">{t('auth.roleCandidate')}</option><option value="Employer">{t('auth.roleEmployer')}</option></select>{field('role')}</label>
        </>}
        <label>{t('auth.password')}<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} maxLength={128} required disabled={busy} />{field('password')}</label>
        {mode === 'register' && <p className="hint">{t('auth.passwordHint')}</p>}
        {error && <div className="error" role="alert">{error}{field('non_field_errors')}</div>}
        <button className="primary" type="submit" disabled={busy}>{busy ? t('auth.busy') : mode === 'login' ? t('auth.submitLogin') : t('auth.submitRegister')}</button>
      </form>
      <p className="hint footer-hint">{t('auth.footerHint')}</p>
    </section>
  );
}
