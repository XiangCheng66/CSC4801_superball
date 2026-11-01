import { useEffect, useState } from 'react';
import { availabilityApi } from '../../api/scheduling';
import { beijingInput, formatTime, slotTimes } from './time';

function errorText(failure) {
  if (failure.code === 'slot_booked') return '该时段已被预约，无法删除。列表已重新加载。';
  if (failure.code === 'slot_started') return '该时段已经开始，无法删除。列表已重新加载。';
  const details = Object.values(failure.fields || {}).flat().join(' ');
  return details || failure.message || '操作失败，请重试。';
}

export default function AvailabilityPanel({ onLoggedOut, revision = 0 }) {
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
      if (!jobId) throw new Error('请先选择岗位。');
      times = slotTimes(start);
      if (new Date(times.start_at).getTime() <= Date.now()) throw new Error('开始时间必须晚于当前时间。');
    } catch (failure) { setError(failure.message); return; }
    setBusy(true);
    try {
      await availabilityApi.create({ job_id: Number(jobId), ...times });
      setStart('');
      setNotice('时段已创建。');
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
      setNotice('时段已删除。');
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
        <div><p className="eyebrow">INTERVIEW AVAILABILITY</p><h2 id="availability-title">面试时段</h2><p className="muted">为你的岗位开放对话时间。每个时段 30 分钟，统一使用北京时间（UTC+8）。</p></div>
        <button className="secondary" disabled={loading || busy} onClick={() => { setError(''); setNotice(''); refresh(); }}>刷新时段</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {loading && <p role="status">正在加载时段…</p>}
      {!loading && !loaded && <p className="hint">暂时无法读取时段，请点击“刷新时段”重试。</p>}
      {loaded && <div className="availability-layout">
        <div className="availability-create">
          <h3>新增时段</h3>
          {!jobs.length ? <p className="availability-empty">你还没有岗位。创建岗位后，就可以在这里安排面试时段。</p> : <form onSubmit={create} aria-label="新增面试时段">
            <label htmlFor="slot-job">所属岗位<select id="slot-job" value={jobId} onChange={(event) => setJobId(event.target.value)} disabled={disabled} required>{jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
            <label htmlFor="slot-start">开始时间（北京时间）<input id="slot-start" type="datetime-local" step="60" value={start} min={beijingInput(new Date(now))} onChange={(event) => setStart(event.target.value)} disabled={disabled} required aria-describedby="slot-end" /></label>
            <p id="slot-end" className="hint">{endPreview ? `结束时间：${endPreview}（北京时间）` : '结束时间会自动设为开始后的 30 分钟。'}</p>
            <button className="primary" disabled={disabled} type="submit">创建时段</button>
          </form>}
        </div>
        <div className="availability-list">
          <h3>我的时段 <span className="availability-count">{available.length} 个可预约</span></h3>
          {!slots.length ? <p className="availability-empty">还没有面试时段。选择岗位和时间，创建第一个时段。</p> : <ul aria-label="我的面试时段">{slots.map((slot) => {
            const canDelete = !slot.is_booked && slot.is_available && new Date(slot.start_at).getTime() > now;
            const status = slot.is_booked ? '已预约' : canDelete ? '可预约' : '已开始 / 已结束';
            return <li key={slot.id} className="availability-slot">
              <div className="availability-slot-heading"><strong>{slot.job_title}</strong><span className={`availability-badge ${canDelete ? 'available' : ''}`}>{status}</span></div>
              <p className="availability-time"><time dateTime={slot.start_at}>{formatTime(slot.start_at)}</time><span> → </span><time dateTime={slot.end_at}>{formatTime(slot.end_at)}</time></p>
              {canDelete ? confirmId === slot.id ? <div className="availability-confirm"><span>确定删除这个时段？</span><button className="secondary" disabled={disabled} onClick={() => remove(slot.id)}>确认删除</button><button className="text-button" disabled={disabled} onClick={() => setConfirmId(null)}>取消</button></div> : <button className="text-button availability-delete" disabled={disabled} onClick={() => setConfirmId(slot.id)} aria-label={`删除时段 ${formatTime(slot.start_at)} ${slot.job_title}`}>删除时段</button> : <p className="hint">{slot.is_booked ? '已有预约，无法删除。' : '保留历史记录，无法删除。'}</p>}
            </li>;
          })}</ul>}
        </div>
      </div>}
    </section>
  );
}
