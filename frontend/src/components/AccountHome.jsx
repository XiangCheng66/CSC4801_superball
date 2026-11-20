import { useState } from 'react';
import { authApi } from '../api/auth';
import { useI18n } from '../i18n/LanguageProvider';

export default function AccountHome({ user, onUserChanged, onLoggedOut }) {
  const { t, language } = useI18n();
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

  const roleName = user.role === 'Candidate' ? t('account.roleCandidate') : t('account.roleEmployer');
  // The role value from the API is part of the contract; keep it visible in
  // Chinese mode and show it alone in English mode.
  const roleBadge = language === 'zh' ? `${roleName} · ${user.role}` : user.role;

  return (
    <section className="auth-card account-card" aria-labelledby="account-title">
      <span className="role-badge">{roleBadge}</span>
      <h2 id="account-title">{t('account.greeting', { name: user.display_name || user.username })}</h2>
      <p className="muted">{t('account.ready')}</p>
      <dl className="account-details">
        <div><dt>{t('account.username')}</dt><dd>{user.username}</dd></div>
        <div><dt>{t('account.email')}</dt><dd>{user.email}</dd></div>
        <div><dt>{t('account.role')}</dt><dd>{user.role}</dd></div>
      </dl>
      <p className="hint">{user.role === 'Candidate' ? t('account.candidateHint') : t('account.employerHint')}</p>
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="primary" disabled={busy} onClick={() => action(async () => { onUserChanged(await authApi.me()); setNotice(t('account.refreshed')); })}>{t('account.refresh')}</button>
        <button className="secondary" disabled={busy} onClick={() => action(async () => { await authApi.workspace(user.role); setNotice(t('account.roleOk')); })}>{t('account.checkRole')}</button>
        <button className="text-button" disabled={busy} onClick={() => action(async () => { await authApi.logout(); onLoggedOut(); })}>{t('account.logout')}</button>
      </div>
    </section>
  );
}
