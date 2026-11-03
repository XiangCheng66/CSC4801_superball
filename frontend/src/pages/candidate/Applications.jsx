import { useEffect, useRef, useState } from 'react';
import { applicationApi } from '../../api/applications';
import { formatTime } from '../scheduling/time';

const STATUS_LABELS = {
  Pending: '待处理', Interviewing: '面试中', Rejected: '已拒绝', Accepted: '已录用',
};

export function ApplicationStatus({ status }) {
  return <span className="application-status">{status} · {STATUS_LABELS[status] || status}</span>;
}

export function ApplyButton({ jobId, onApplied, onConflict, onLoggedOut }) {
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
      else if (failure.status === 404) setError('该岗位已不存在，请刷新岗位列表。');
      else setError([failure.message, ...Object.values(failure.fields || {}).flat()].join(' '));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="application-action">
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary" onClick={apply} disabled={busy}>{busy ? '正在投递…' : '投递岗位'}</button>
  </div>;
}

export default function Applications({ onLoggedOut, onBrowseJobs }) {
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
      <h2 id="applications-title">我的申请</h2>
      <button className="secondary" disabled={loading} onClick={() => setAttempt((value) => value + 1)}>刷新申请</button>
    </div>
    <p className="muted">查看你投递的岗位、当前状态及已有面试预约。状态由岗位所属雇主维护。</p>
    {loading ? <p role="status">正在加载申请…</p> : error ? <div>
      <p className="error" role="alert">{error}</p>
      <button className="secondary" onClick={() => setAttempt((value) => value + 1)}>重新加载申请</button>
    </div> : rows.length === 0 ? <div className="empty-state">
      <p>你还没有投递岗位。</p>
      <button className="secondary" onClick={onBrowseJobs}>浏览岗位</button>
    </div> : <div className="job-list">{rows.map((row) => <article className="job-card application-card" key={row.id}>
      <div className="job-heading"><h3>{row.job.title}</h3><ApplicationStatus status={row.status} /></div>
      <p className="job-company">{row.job.company}</p>
      <p className="hint">申请编号 #{row.id}</p>
      <details><summary>查看岗位描述</summary><p className="job-description">{row.job.description}</p></details>
      <div className="application-booking">
        <h4>面试预约</h4>
        {row.booking ? <>
          <p>预约编号 #{row.booking.id} · 时段 #{row.booking.slot_id}</p>
          <p>{formatTime(row.booking.start_at)} ～ {formatTime(row.booking.end_at)}</p>
          <p className="hint">北京时间（UTC+8）</p>
        </> : <p>尚无面试预约。</p>}
      </div>
    </article>)}</div>}
  </section>;
}
