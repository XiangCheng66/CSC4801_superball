import { useEffect, useRef, useState } from 'react';
import { employerApi } from '../../api/employer';
import { useI18n } from '../../i18n/LanguageProvider';
import { formatTime } from '../scheduling/time';

const EMPTY_JOB = { title: '', description: '', skills: '' };
const STATUSES = ['Pending', 'Interviewing', 'Rejected', 'Accepted'];

export function splitSkills(value) {
  return value
    .split(/[,，;；\r\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, all) => all.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index);
}

export default function EmployerWorkspace({ user, onLoggedOut, embedded = false, onJobsChanged }) {
  const { t, language, statusName } = useI18n();
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
  const [applicantsJob, setApplicantsJob] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [applicantsBusy, setApplicantsBusy] = useState(false);
  const [applicantsResult, setApplicantsResult] = useState({});
  const requestedJob = useRef(null);
  const listSeparator = language === 'zh' ? '、' : ', ';

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
      setResult({ error: t('employer.deleteBlocked') });
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
      setCompanyResult({ notice: t('employer.companySaved') });
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
      setJobResult({ notice: t('employer.published', { title: created.title }) });
      onJobsChanged?.();
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
      setJobResult({ notice: t('employer.updated', { title: updated.title }) });
      onJobsChanged?.();
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
      if (applicantsJob === job.id) {
        requestedJob.current = null;
        setApplicantsJob(null);
        setApplicants([]);
      }
      setJobResult({ notice: t('employer.deleted', { title: job.title }) });
      onJobsChanged?.();
    } catch (failure) {
      handleFailure(failure, setJobResult);
    } finally {
      setJobBusy(false);
    }
  }

  async function toggleApplicants(job) {
    if (applicantsJob === job.id) {
      requestedJob.current = null;
      setApplicantsJob(null);
      setApplicants([]);
      setApplicantsResult({});
      return;
    }
    requestedJob.current = job.id;
    setApplicantsJob(job.id);
    setApplicants([]);
    setApplicantsResult({});
    setApplicantsBusy(true);
    try {
      const rows = await employerApi.listApplicants(job.id);
      if (requestedJob.current !== job.id) return; // A newer request owns the panel.
      setApplicants(rows);
    } catch (failure) {
      if (requestedJob.current !== job.id) return;
      if (failure.status === 401) onLoggedOut();
      else setApplicantsResult({ error: failure.message });
    } finally {
      if (requestedJob.current === job.id) setApplicantsBusy(false);
    }
  }

  async function changeStatus(row, status) {
    if (applicantsBusy || status === row.status) return;
    setApplicantsBusy(true);
    setApplicantsResult({});
    try {
      const updated = await employerApi.updateApplicationStatus(row.id, status);
      setApplicants((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setApplicantsResult({ notice: t('employer.statusChanged', { name: row.display_name, status: statusName(status) }) });
    } catch (failure) {
      if (failure.status === 401) onLoggedOut();
      else setApplicantsResult({ error: failure.message });
    } finally {
      setApplicantsBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="auth-card">
        <p role="status">{t('employer.loadingWorkspace')}</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="auth-card">
        <h2>{t('employer.workspaceFailed')}</h2>
        <p className="error" role="alert">{loadError}</p>
        <button className="primary" onClick={() => setAttempt(attempt + 1)}>{t('app.retry')}</button>
      </section>
    );
  }

  return (
    <section className="auth-card employer-workspace" aria-labelledby="employer-title">
      {!embedded && <span className="role-badge">{language === 'zh' ? `${t('employer.roleBadge')} · ${user.role}` : user.role}</span>}
      <h2 id="employer-title">{embedded ? t('employer.panelTitle') : t('employer.greeting', { name: user.display_name || user.username })}</h2>
      <p className="muted">{t('employer.subtitle')}</p>

      <form onSubmit={saveCompany} aria-labelledby="company-heading">
        <h3 id="company-heading">{t('employer.companySection')}</h3>
        <label>
          {t('employer.companyName')}
          <input
            value={company.company_name}
            maxLength={200}
            required
            onChange={(event) => setCompany({ ...company, company_name: event.target.value })}
          />
        </label>
        <label>
          {t('employer.companyDescription')}
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
          <button className="primary" type="submit" disabled={companyBusy}>{t('employer.saveCompany')}</button>
        </div>
      </form>

      <form onSubmit={createJob} aria-labelledby="new-job-heading">
        <h3 id="new-job-heading">{t('employer.newJobSection')}</h3>
        <label>
          {t('employer.jobTitle')}
          <input
            value={draft.title}
            maxLength={200}
            required
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label>
          {t('employer.jobDescription')}
          <textarea
            value={draft.description}
            rows={3}
            required
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </label>
        <label>
          {t('employer.jobSkills')}
          <input
            value={draft.skills}
            onChange={(event) => setDraft({ ...draft, skills: event.target.value })}
          />
        </label>
        <div className="actions">
          <button className="primary" type="submit" disabled={jobBusy}>{t('employer.publishJob')}</button>
        </div>
      </form>

      {jobResult.notice && <p className="notice" role="status">{jobResult.notice}</p>}
      {jobResult.error && <p className="error" role="alert">{jobResult.error}</p>}

      <h3>{t('employer.myJobs', { count: jobs.length })}</h3>
      {jobs.length === 0 ? (
        <p className="hint">{t('employer.noJobsHint')}</p>
      ) : (
        <ul className="job-list">
          {jobs.map((job) => (
            <li key={job.id}>
              {editing?.id === job.id ? (
                <form onSubmit={saveJob}>
                  <input
                    aria-label={t('employer.editTitle')}
                    value={editing.title}
                    maxLength={200}
                    required
                    onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                  />
                  <textarea
                    aria-label={t('employer.editDescription')}
                    value={editing.description}
                    rows={3}
                    required
                    onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                  />
                  <input
                    aria-label={t('employer.editSkills')}
                    value={editing.skills}
                    onChange={(event) => setEditing({ ...editing, skills: event.target.value })}
                  />
                  <div className="actions">
                    <button className="primary" type="submit" disabled={jobBusy}>{t('employer.save')}</button>
                    <button className="text-button" type="button" onClick={() => setEditing(null)}>{t('employer.cancel')}</button>
                  </div>
                </form>
              ) : (
                <>
                  <strong>{job.title}</strong>
                  <p className="muted">{job.description}</p>
                  <p className="hint">
                    {job.required_skills.length
                      ? t('employer.skillsPrefix', { skills: job.required_skills.join(listSeparator) })
                      : t('employer.noSkillsHint')}
                  </p>
                  <div className="row-actions">
                    <button className="secondary" type="button" onClick={() => toggleApplicants(job)}>
                      {applicantsJob === job.id ? t('employer.hideApplicants') : t('employer.showApplicants')}
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => setEditing({ ...job, skills: job.required_skills.join(', ') })}
                    >
                      {t('employer.edit')}
                    </button>
                    <button className="text-button" type="button" disabled={jobBusy} onClick={() => removeJob(job)}>
                      {t('employer.delete')}
                    </button>
                  </div>
                  {applicantsJob === job.id && (
                    <div className="applicant-panel">
                      <h4>{t('employer.applicantsTitle', { count: applicants.length })}</h4>
                      {applicantsBusy && <p className="hint" role="status">{t('employer.processing')}</p>}
                      {applicantsResult.notice && <p className="notice" role="status">{applicantsResult.notice}</p>}
                      {applicantsResult.error && <p className="error" role="alert">{applicantsResult.error}</p>}
                      {!applicantsBusy && applicants.length === 0 && (
                        <p className="hint">{t('employer.noApplicants')}</p>
                      )}
                      {applicants.length > 0 && (
                        <ul className="applicant-list" aria-label={t('employer.applicantListLabel', { job: job.title })}>
                          {applicants.map((row) => (
                            <li key={row.id}>
                              <div className="applicant-line">
                                <strong>{row.display_name}</strong>
                                <span className="applicant-score">{t('employer.applicantScore', { score: row.match_score })}</span>
                              </div>
                              <p className="hint">
                                {row.skills.length
                                  ? t('employer.applicantSkills', { skills: row.skills.join(listSeparator) })
                                  : t('employer.applicantNoSkills')}
                              </p>
                              <p className="hint">
                                {row.booking
                                  ? t('employer.interviewAt', { time: formatTime(row.booking.start_at) })
                                  : t('employer.noInterview')}
                              </p>
                              <div className="applicant-status">
                                <span className="hint">{t('employer.applicationStatus')}</span>
                                <select
                                  aria-label={t('employer.statusLabel', { name: row.display_name })}
                                  value={row.status}
                                  disabled={applicantsBusy}
                                  onChange={(event) => changeStatus(row, event.target.value)}
                                >
                                  {STATUSES.map((status) => (
                                    <option key={status} value={status}>{statusName(status)}</option>
                                  ))}
                                </select>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
