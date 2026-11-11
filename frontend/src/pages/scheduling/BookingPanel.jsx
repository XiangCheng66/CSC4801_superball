import { useEffect, useRef, useState } from 'react';
import { bookingApi } from '../../api/bookings';
import { useI18n } from '../../i18n/LanguageProvider';
import { formatTime } from './time';

export default function BookingPanel({ role, onLoggedOut }) {
  const { t } = useI18n();
  const candidate = role === 'Candidate';
  const [applications, setApplications] = useState([]);
  const [applicationId, setApplicationId] = useState('');
  const [bookings, setBookings] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [slotError, setSlotError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    Promise.all([bookingApi.list(controller.signal), candidate ? bookingApi.applications(controller.signal) : Promise.resolve([])])
      .then(([rows, apps]) => {
        if (controller.signal.aborted) return;
        setBookings(rows);
        setApplications(apps);
        setApplicationId((id) => apps.some((app) => String(app.id) === id) ? id : String(apps[0]?.id || ''));
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onLoggedOut();
        else setLoadError(failure.message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, candidate, onLoggedOut]);

  useEffect(() => {
    const controller = new AbortController();
    setSlots([]);
    setSlotError('');
    if (!candidate || !applicationId) { setSlotsLoading(false); return () => controller.abort(); }
    setSlotsLoading(true);
    bookingApi.slots(applicationId, controller.signal)
      .then((rows) => { if (!controller.signal.aborted) setSlots(rows); })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onLoggedOut();
        else setSlotError(failure.message);
      })
      .finally(() => { if (!controller.signal.aborted) setSlotsLoading(false); });
    return () => controller.abort();
  }, [applicationId, attempt, candidate, onLoggedOut]);

  function refresh() { setLoading(true); setAttempt((value) => value + 1); }

  async function book(slotId) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await bookingApi.create(Number(applicationId), slotId);
      setNotice(t('booking.created'));
      refresh();
    } catch (failure) {
      if (failure.status === 401) onLoggedOut();
      else {
        const messages = {
          slot_already_booked: t('booking.errAlreadyBooked'),
          application_already_booked: t('booking.errApplicationBooked'),
          booking_ineligible: t('booking.errIneligible'),
        };
        setError(messages[failure.code] || failure.message);
        if ([403, 404, 409].includes(failure.status)) refresh();
      }
    } finally { submitting.current = false; setBusy(false); }
  }

  return <section className="auth-card booking-panel" aria-labelledby="booking-title">
    <div className="availability-header"><div><h2 id="booking-title">{t('booking.title')}</h2><p className="muted">{t('booking.subtitle')}</p></div><button className="secondary" disabled={loading || busy} onClick={() => { setError(''); setNotice(''); refresh(); }}>{t('booking.refresh')}</button></div>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status" className="notice">{notice}</p>}
    {loading ? <p role="status">{t('booking.loading')}</p> : loadError ? <p role="alert" className="error">{loadError}</p> : <>
      {candidate && <section className="booking-create" aria-label={t('booking.createLabel')}>
        <h3>{t('booking.chooseTitle')}</h3>
        {!applications.length ? <p className="empty-state">{t('booking.noApplications')}</p> : <>
          <label>{t('booking.chooseApplication')}<select value={applicationId} disabled={busy} onChange={(event) => { setApplicationId(event.target.value); setSlots([]); setSlotsLoading(true); setError(''); setNotice(''); }}>{applications.map((app) => <option key={app.id} value={app.id}>{t('booking.applicationOption', { job: app.job_title, id: app.id })}</option>)}</select></label>
          <p className="hint">{t('booking.slotsHint')}</p>
          {slotsLoading ? <p role="status">{t('booking.loadingSlots')}</p> : slotError ? <p className="error" role="alert">{slotError}</p> : !slots.length ? <p className="empty-state">{t('booking.noSlots')}</p> : <ul className="booking-list" aria-label={t('booking.slotListLabel')}>{slots.map((slot) => <li key={slot.id}><div><strong>{formatTime(slot.start_at)} → {formatTime(slot.end_at)}</strong><p className="hint">{slot.job_title}</p></div><button className="primary" disabled={busy} onClick={() => book(slot.id)} aria-label={t('booking.bookLabel', { time: formatTime(slot.start_at) })}>{t('booking.book')}</button></li>)}</ul>}
        </>}
      </section>}
      <h3>{candidate ? t('booking.myBookings') : t('booking.receivedBookings')}</h3>
      {!bookings.length ? <p className="empty-state">{t('booking.noBookings')}</p> : <ul className="booking-list" aria-label={t('booking.listLabel')}>{bookings.map((booking) => <li key={booking.id}><div><strong>{booking.job_title}</strong>{!candidate && <p>{booking.candidate_name}</p>}<p>{formatTime(booking.start_at)} → {formatTime(booking.end_at)}</p><p className="hint">{t('booking.applicationNumber', { id: booking.application_id })} · {t('booking.bookingNumber', { id: booking.id })}</p></div><span className="availability-badge">{t('booking.bookedBadge')}</span></li>)}</ul>}
    </>}
  </section>;
}
