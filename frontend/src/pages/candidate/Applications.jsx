import { useEffect, useRef, useState } from 'react';
import { applicationApi } from '../../api/applications';
import { useI18n } from '../../i18n/LanguageProvider';
import { formatTime } from '../scheduling/time';

export function ApplicationStatus({ status }) {
  const { statusLabel } = useI18n();
  return <span className="application-status">{statusLabel(status)}</span>;
}

export function ApplyButton({ jobId, onApplied, onConflict, onLoggedOut }) {
  const { t } = useI18n();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function apply() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      onApplied(await applicationApi.apply(jobId));
    } catch (failure) {
      if (failure.status === 401) onLoggedOut();
      else if (failure.code === 'application_conflict') onConflict();
      else if (failure.status === 404) setError(t('candidate.jobGone'));
      else setError([failure.message, ...Object.values(failure.fields || {}).flat()].join(' '));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="application-action">
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary" onClick={apply} disabled={busy}>{busy ? t('candidate.applying') : t('candidate.apply')}</button>
  </div>;
}

export default function Applications({ onLoggedOut, onBrowseJobs }) {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    applicationApi.list(controller.signal)
      .then((data) => { if (!controller.signal.aborted) setRows(data); })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onLoggedOut();
        else setError(failure.message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, onLoggedOut]);

  return <section aria-labelledby="applications-title">
    <div className="application-header">
      <h2 id="applications-title">{t('candidate.applicationsTitle')}</h2>
      <button className="secondary" disabled={loading} onClick={() => setAttempt((value) => value + 1)}>{t('candidate.refreshApplications')}</button>
    </div>
    <p className="muted">{t('candidate.applicationsSubtitle')}</p>
    {loading ? <p role="status">{t('candidate.loadingApplications')}</p> : error ? <div>
      <p className="error" role="alert">{error}</p>
      <button className="secondary" onClick={() => setAttempt((value) => value + 1)}>{t('candidate.reloadApplications')}</button>
    </div> : rows.length === 0 ? <div className="empty-state">
      <p>{t('candidate.noApplications')}</p>
      <button className="secondary" onClick={onBrowseJobs}>{t('candidate.browseJobs')}</button>
    </div> : <div className="job-list">{rows.map((row) => <article className="job-card application-card" key={row.id}>
      <div className="job-heading"><h3>{row.job.title}</h3><ApplicationStatus status={row.status} /></div>
      <p className="job-company">{row.job.company}</p>
      <p className="hint">{t('candidate.applicationNumber', { id: row.id })}</p>
      <details><summary>{t('candidate.viewDescription')}</summary><p className="job-description">{row.job.description}</p></details>
      <div className="application-booking">
        <h4>{t('candidate.bookingTitle')}</h4>
        {row.booking ? <>
          <p>{t('candidate.bookingNumber', { id: row.booking.id })} · {t('candidate.slotNumber', { id: row.booking.slot_id })}</p>
          <p>{formatTime(row.booking.start_at)} ～ {formatTime(row.booking.end_at)}</p>
          <p className="hint">{t('candidate.beijingTime')}</p>
        </> : <p>{t('candidate.noBooking')}</p>}
      </div>
    </article>)}</div>}
  </section>;
}
