import { useEffect, useState } from 'react';
import { availabilityApi } from '../../api/scheduling';
import { useI18n } from '../../i18n/LanguageProvider';
import { beijingInput, formatTime, slotTimes } from './time';

export default function AvailabilityPanel({ onLoggedOut, revision = 0 }) {
  const { t } = useI18n();
  const [jobs, setJobs] = useState([]);
  const [slots, setSlots] = useState([]);
  const [jobId, setJobId] = useState('');
  const [start, setStart] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now());

  function errorText(failure) {
    if (failure.code === 'slot_booked') return t('availability.errBooked');
    if (failure.code === 'slot_started') return t('availability.errStarted');
    const details = Object.values(failure.fields || {}).flat().join(' ');
    return details || failure.message || t('availability.errGeneric');
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([availabilityApi.jobs(controller.signal), availabilityApi.list(controller.signal)])
      .then(([nextJobs, nextSlots]) => {
        if (controller.signal.aborted) return;
        setJobs(nextJobs);
        setSlots(nextSlots);
        setJobId((current) => nextJobs.some((job) => String(job.id) === current) ? current : String(nextJobs[0]?.id || ''));
        setNow(Date.now());
        setLoaded(true);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setLoaded(false);
        if (failure.status === 401) onLoggedOut();
        else setError(errorText(failure));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, onLoggedOut, revision]);

  function refresh() {
    setLoading(true);
    setConfirmId(null);
    setAttempt((current) => current + 1);
  }

  async function create(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    let times;
    try {
      if (!jobId) throw new Error(t('availability.errChooseJob'));
      // time.js raises Chinese validation messages; translate the outcome here
      // so the panel stays in the selected language.
      try { times = slotTimes(start); } catch { throw new Error(t('availability.errTime')); }
      if (new Date(times.start_at).getTime() <= Date.now()) throw new Error(t('availability.errFuture'));
    } catch (failure) { setError(failure.message); return; }
    setBusy(true);
    try {
      await availabilityApi.create({ job_id: Number(jobId), ...times });
      setStart('');
      setNotice(t('availability.created'));
      refresh();
    } catch (failure) {
      if (failure.status === 401) onLoggedOut();
      else setError(errorText(failure));
    } finally { setBusy(false); }
  }

  async function remove(id) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await availabilityApi.remove(id);
      setNotice(t('availability.deleted'));
      refresh();
    } catch (failure) {
      if (failure.status === 401) onLoggedOut();
      else {
        setError(errorText(failure));
        if (failure.status === 409 || failure.status === 404) refresh();
      }
    } finally { setBusy(false); }
  }

  let endPreview = '';
  try { if (start) endPreview = formatTime(slotTimes(start).end_at); } catch { /* Validate on submit. */ }
  const disabled = loading || busy || !loaded;
  const available = slots.filter((slot) => !slot.is_booked && slot.is_available && new Date(slot.start_at).getTime() > now);

  return (
    <section className="auth-card availability-panel" aria-labelledby="availability-title">
      <div className="availability-header">
        <div><p className="eyebrow">INTERVIEW AVAILABILITY</p><h2 id="availability-title">{t('availability.title')}</h2><p className="muted">{t('availability.subtitle')}</p></div>
        <button className="secondary" disabled={loading || busy} onClick={() => { setError(''); setNotice(''); refresh(); }}>{t('availability.refresh')}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {loading && <p role="status">{t('availability.loading')}</p>}
      {!loading && !loaded && <p className="hint">{t('availability.loadFailed')}</p>}
      {loaded && <div className="availability-layout">
        <div className="availability-create">
          <h3>{t('availability.createTitle')}</h3>
          {!jobs.length ? <p className="availability-empty">{t('availability.noJobs')}</p> : <form onSubmit={create} aria-label={t('availability.formLabel')}>
            <label htmlFor="slot-job">{t('availability.job')}<select id="slot-job" value={jobId} onChange={(event) => setJobId(event.target.value)} disabled={disabled} required>{jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
            <label htmlFor="slot-start">{t('availability.startTime')}<input id="slot-start" type="datetime-local" step="60" value={start} min={beijingInput(new Date(now))} onChange={(event) => setStart(event.target.value)} disabled={disabled} required aria-describedby="slot-end" /></label>
            <p id="slot-end" className="hint">{endPreview ? t('availability.endPreview', { time: endPreview }) : t('availability.endHint')}</p>
            <button className="primary" disabled={disabled} type="submit">{t('availability.create')}</button>
          </form>}
        </div>
        <div className="availability-list">
          <h3>{t('availability.mySlots')} <span className="availability-count">{t('availability.availableCount', { count: available.length })}</span></h3>
          {!slots.length ? <p className="availability-empty">{t('availability.noSlots')}</p> : <ul aria-label={t('availability.slotListLabel')}>{slots.map((slot) => {
            const canDelete = !slot.is_booked && slot.is_available && new Date(slot.start_at).getTime() > now;
            const status = slot.is_booked ? t('availability.booked') : canDelete ? t('availability.available') : t('availability.started');
            return <li key={slot.id} className="availability-slot">
              <div className="availability-slot-heading"><strong>{slot.job_title}</strong><span className={`availability-badge ${canDelete ? 'available' : ''}`}>{status}</span></div>
              <p className="availability-time"><time dateTime={slot.start_at}>{formatTime(slot.start_at)}</time><span> → </span><time dateTime={slot.end_at}>{formatTime(slot.end_at)}</time></p>
              {canDelete ? confirmId === slot.id ? <div className="availability-confirm"><span>{t('availability.confirmDelete')}</span><button className="secondary" disabled={disabled} onClick={() => remove(slot.id)}>{t('availability.confirm')}</button><button className="text-button" disabled={disabled} onClick={() => setConfirmId(null)}>{t('availability.cancel')}</button></div> : <button className="text-button availability-delete" disabled={disabled} onClick={() => setConfirmId(slot.id)} aria-label={t('availability.deleteLabel', { time: formatTime(slot.start_at), job: slot.job_title })}>{t('availability.deleteSlot')}</button> : <p className="hint">{slot.is_booked ? t('availability.cannotDeleteBooked') : t('availability.keepHistory')}</p>}
            </li>;
          })}</ul>}
        </div>
      </div>}
    </section>
  );
}
