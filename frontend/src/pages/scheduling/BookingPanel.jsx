import { useEffect, useRef, useState } from 'react';
import { bookingApi } from '../../api/bookings';
import { formatTime } from './time';

export default function BookingPanel({ role, onLoggedOut }) {
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
      setNotice('面试预约成功，请在下方查看时间。');
      refresh();
    } catch (failure) {
      if (failure.status === 401) onLoggedOut();
      else {
        const messages = { slot_already_booked: '这个时段已被预约，请选择其他时段。', application_already_booked: '这份申请已有预约，请查看下方记录。', booking_ineligible: '申请状态或时段已变化，请刷新后重新选择。' };
        setError(messages[failure.code] || failure.message);
        if ([403, 404, 409].includes(failure.status)) refresh();
      }
    } finally { submitting.current = false; setBusy(false); }
  }

  return <section className="auth-card booking-panel" aria-labelledby="booking-title">
    <div className="availability-header"><div><h2 id="booking-title">面试预约</h2><p className="muted">面试时间均为北京时间（UTC+8）。</p></div><button className="secondary" disabled={loading || busy} onClick={() => { setError(''); setNotice(''); refresh(); }}>刷新预约</button></div>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status" className="notice">{notice}</p>}
    {loading ? <p role="status">正在加载预约…</p> : loadError ? <p role="alert" className="error">{loadError}</p> : <>
      {candidate && <section className="booking-create" aria-label="预约面试">
        <h3>选择面试时间</h3>
        {!applications.length ? <p className="empty-state">暂无可预约的申请。申请进入 Interviewing 且尚未预约时，会显示在这里。</p> : <>
          <label>选择申请<select value={applicationId} disabled={busy} onChange={(event) => { setApplicationId(event.target.value); setSlots([]); setSlotsLoading(true); setError(''); setNotice(''); }}>{applications.map((app) => <option key={app.id} value={app.id}>{app.job_title} · 申请 #{app.id}</option>)}</select></label>
          <p className="hint">可选择该雇主开放的任一面试时段。</p>
          {slotsLoading ? <p role="status">正在加载可用时段…</p> : slotError ? <p className="error" role="alert">{slotError}</p> : !slots.length ? <p className="empty-state">这位雇主暂无可用时段，请稍后刷新。</p> : <ul className="booking-list" aria-label="可预约时段">{slots.map((slot) => <li key={slot.id}><div><strong>{formatTime(slot.start_at)} → {formatTime(slot.end_at)}</strong><p className="hint">{slot.job_title}</p></div><button className="primary" disabled={busy} onClick={() => book(slot.id)} aria-label={`预约 ${formatTime(slot.start_at)}`}>预约此时段</button></li>)}</ul>}
        </>}
      </section>}
      <h3>{candidate ? '我的预约' : '收到的预约'}</h3>
      {!bookings.length ? <p className="empty-state">暂无预约记录。</p> : <ul className="booking-list" aria-label="预约记录">{bookings.map((booking) => <li key={booking.id}><div><strong>{booking.job_title}</strong>{!candidate && <p>{booking.candidate_name}</p>}<p>{formatTime(booking.start_at)} → {formatTime(booking.end_at)}</p><p className="hint">申请 #{booking.application_id} · 预约 #{booking.id}</p></div><span className="availability-badge">已预约</span></li>)}</ul>}
    </>}
  </section>;
}
