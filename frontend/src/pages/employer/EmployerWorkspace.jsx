import { useEffect, useState } from 'react';
import { employerApi } from '../../api/employer';

const EMPTY_JOB = { title: '', description: '', skills: '' };

export function splitSkills(value) {
  return value
    .split(/[,，;；\r\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, all) => all.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index);
}

export default function EmployerWorkspace({ user, onLoggedOut }) {
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [company, setCompany] = useState({ company_name: '', description: '' });
  const [companyBusy, setCompanyBusy] = useState(false);
  const [companyResult, setCompanyResult] = useState({});
  const [jobs, setJobs] = useState([]);
  const [draft, setDraft] = useState(EMPTY_JOB);
  const [editing, setEditing] = useState(null);
  const [jobBusy, setJobBusy] = useState(false);
  const [jobResult, setJobResult] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    Promise.all([
      employerApi.getCompany(controller.signal).catch((failure) => {
        if (failure.status === 404) return null; // No profile yet; the form starts empty.
        throw failure;
      }),
      employerApi.listJobs(controller.signal),
    ])
      .then(([profile, list]) => {
        if (controller.signal.aborted) return;
        if (profile) setCompany({ company_name: profile.company_name, description: profile.description });
        setJobs(list);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onLoggedOut();
        else setLoadError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);

  function handleFailure(failure, setResult) {
    if (failure.status === 401) {
      onLoggedOut();
      return;
    }
    if (failure.status === 409) {
      setResult({ error: '该岗位仍有申请或面试时段，无法删除。' });
      return;
    }
    setResult({ error: failure.message });
  }

  async function saveCompany(event) {
    event.preventDefault();
    if (companyBusy) return;
    setCompanyBusy(true);
    setCompanyResult({});
    try {
      const saved = await employerApi.saveCompany({
        company_name: company.company_name,
        description: company.description,
      });
      setCompany({ company_name: saved.company_name, description: saved.description });
      setCompanyResult({ notice: '公司资料已保存。' });
    } catch (failure) {
      handleFailure(failure, setCompanyResult);
    } finally {
      setCompanyBusy(false);
    }
  }

  async function createJob(event) {
    event.preventDefault();
    if (jobBusy) return;
    setJobBusy(true);
    setJobResult({});
    try {
      const created = await employerApi.createJob({
        title: draft.title,
        description: draft.description,
        required_skills: splitSkills(draft.skills),
      });
      setJobs((current) => [...current, created]);
      setDraft(EMPTY_JOB);
      setJobResult({ notice: `已发布「${created.title}」。` });
    } catch (failure) {
      handleFailure(failure, setJobResult);
    } finally {
      setJobBusy(false);
    }
  }

  async function saveJob(event) {
    event.preventDefault();
    if (jobBusy || !editing) return;
    setJobBusy(true);
    setJobResult({});
    try {
      const updated = await employerApi.updateJob(editing.id, {
        title: editing.title,
        description: editing.description,
        required_skills: splitSkills(editing.skills),
      });
      setJobs((current) => current.map((job) => (job.id === updated.id ? updated : job)));
      setEditing(null);
      setJobResult({ notice: `已更新「${updated.title}」。` });
    } catch (failure) {
      handleFailure(failure, setJobResult);
    } finally {
      setJobBusy(false);
    }
  }

  async function removeJob(job) {
    if (jobBusy) return;
    setJobBusy(true);
    setJobResult({});
    try {
      await employerApi.deleteJob(job.id);
      setJobs((current) => current.filter((row) => row.id !== job.id));
      if (editing?.id === job.id) setEditing(null);
      setJobResult({ notice: `已删除「${job.title}」。` });
    } catch (failure) {
      handleFailure(failure, setJobResult);
    } finally {
      setJobBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="auth-card">
        <p role="status">正在加载雇主工作区…</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="auth-card">
        <h2>工作区加载失败</h2>
        <p className="error" role="alert">{loadError}</p>
        <button className="primary" onClick={() => setAttempt(attempt + 1)}>重试</button>
      </section>
    );
  }

  return (
    <section className="auth-card account-card" aria-labelledby="employer-title">
      <span className="role-badge">雇主 · {user.role}</span>
      <h2 id="employer-title">你好，{user.display_name || user.username}</h2>
      <p className="muted">招聘工作台：维护公司资料与岗位，求职者会看到它们。</p>

      <form onSubmit={saveCompany} aria-labelledby="company-heading">
        <h3 id="company-heading">公司资料</h3>
        <label>
          公司名称
          <input
            value={company.company_name}
            maxLength={200}
            required
            onChange={(event) => setCompany({ ...company, company_name: event.target.value })}
          />
        </label>
        <label>
          公司简介
          <textarea
            value={company.description}
            rows={3}
            required
            onChange={(event) => setCompany({ ...company, description: event.target.value })}
          />
        </label>
        {companyResult.notice && <p className="notice" role="status">{companyResult.notice}</p>}
        {companyResult.error && <p className="error" role="alert">{companyResult.error}</p>}
        <div className="actions">
          <button className="primary" type="submit" disabled={companyBusy}>保存公司资料</button>
        </div>
      </form>

      <form onSubmit={createJob} aria-labelledby="new-job-heading">
        <h3 id="new-job-heading">发布新岗位</h3>
        <label>
          岗位标题
          <input
            value={draft.title}
            maxLength={200}
            required
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label>
          岗位描述
          <textarea
            value={draft.description}
            rows={3}
            required
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </label>
        <label>
          技能要求（逗号分隔，可留空）
          <input
            value={draft.skills}
            onChange={(event) => setDraft({ ...draft, skills: event.target.value })}
          />
        </label>
        <div className="actions">
          <button className="primary" type="submit" disabled={jobBusy}>发布岗位</button>
        </div>
      </form>

      {jobResult.notice && <p className="notice" role="status">{jobResult.notice}</p>}
      {jobResult.error && <p className="error" role="alert">{jobResult.error}</p>}

      <h3>我的岗位（{jobs.length}）</h3>
      {jobs.length === 0 ? (
        <p className="hint">还没有岗位。发布第一条后，求职者就能看到并按技能匹配。</p>
      ) : (
        <ul className="job-list">
          {jobs.map((job) => (
            <li key={job.id}>
              {editing?.id === job.id ? (
                <form onSubmit={saveJob}>
                  <input
                    aria-label="编辑岗位标题"
                    value={editing.title}
                    maxLength={200}
                    required
                    onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                  />
                  <textarea
                    aria-label="编辑岗位描述"
                    value={editing.description}
                    rows={3}
                    required
                    onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                  />
                  <input
                    aria-label="编辑技能要求"
                    value={editing.skills}
                    onChange={(event) => setEditing({ ...editing, skills: event.target.value })}
                  />
                  <div className="actions">
                    <button className="primary" type="submit" disabled={jobBusy}>保存</button>
                    <button className="text-button" type="button" onClick={() => setEditing(null)}>取消</button>
                  </div>
                </form>
              ) : (
                <>
                  <strong>{job.title}</strong>
                  <p className="muted">{job.description}</p>
                  <p className="hint">
                    {job.required_skills.length ? `技能：${job.required_skills.join('、')}` : '无技能要求（匹配分 100）'}
                  </p>
                  <div className="row-actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => setEditing({ ...job, skills: job.required_skills.join(', ') })}
                    >
                      编辑
                    </button>
                    <button className="text-button" type="button" disabled={jobBusy} onClick={() => removeJob(job)}>
                      删除
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
