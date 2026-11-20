import { useEffect, useState } from 'react';
import { candidateApi } from '../../api/candidate';
import { applicationApi } from '../../api/applications';
import AccountHome from '../../components/AccountHome';
import { useI18n } from '../../i18n/LanguageProvider';
import BookingPanel from '../scheduling/BookingPanel';
import Applications, { ApplicationStatus, ApplyButton } from './Applications';

function FieldError({ fields, name, id }) {
  return fields[name] ? <span className="field-error" id={id}>{[].concat(fields[name]).join(' ')}</span> : null;
}

function ProfileEditor({ onUserChanged, onSkillsSaved, onLoggedOut }) {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [skills, setSkills] = useState('');
  const [resume, setResume] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [profileResult, setProfileResult] = useState({});
  const [resumeResult, setResumeResult] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    Promise.all([candidateApi.profile(controller.signal), candidateApi.resume(controller.signal)])
      .then(([profile, savedResume]) => {
        if (controller.signal.aborted) return;
        setName(profile.display_name);
        setSkills(profile.skills.join(', '));
        setResume(savedResume.resume_text);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onLoggedOut();
        else setLoadError(failure.message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  async function saveProfile(event) {
    event.preventDefault();
    if (profileBusy) return;
    setProfileBusy(true);
    setProfileResult({});
    try {
      const saved = await candidateApi.saveProfile({
        display_name: name, skills: skills.split(/[,，\r\n]/),
      });
      setName(saved.display_name);
      setSkills(saved.skills.join(', '));
      onUserChanged((current) => ({ ...current, display_name: saved.display_name }));
      onSkillsSaved();
      setProfileResult({ notice: t('candidate.profileSaved') });
    } catch (failure) {
      if (failure.status === 401) onLoggedOut();
      else setProfileResult({ error: failure.message, fields: failure.fields });
    } finally { setProfileBusy(false); }
  }

  async function saveResume(event) {
    event.preventDefault();
    if (resumeBusy) return;
    setResumeBusy(true);
    setResumeResult({});
    try {
      const saved = await candidateApi.saveResume(resume);
      setResume(saved.resume_text);
      setResumeResult({ notice: t('candidate.resumeSaved') });
    } catch (failure) {
      if (failure.status === 401) onLoggedOut();
      else setResumeResult({ error: failure.message, fields: failure.fields });
    } finally { setResumeBusy(false); }
  }

  if (loading) return <p className="muted">{t('candidate.loadingProfile')}</p>;
  if (loadError) return <div><p className="error" role="alert">{loadError}</p><button className="secondary" onClick={() => setAttempt(attempt + 1)}>{t('candidate.reloadProfile')}</button></div>;
  return <div className="editor-sections">
    <section aria-labelledby="profile-title">
      <h2 id="profile-title">{t('candidate.profileTitle')}</h2>
      <p className="muted">{t('candidate.profileSubtitle')}</p>
      <form onSubmit={saveProfile}>
        <label>{t('candidate.displayName')}<input aria-label={t('candidate.displayName')} aria-describedby="candidate-name-error" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} disabled={profileBusy} /><FieldError fields={profileResult.fields || {}} name="display_name" id="candidate-name-error" /></label>
        <label>{t('candidate.skills')}<textarea aria-label={t('candidate.skills')} aria-describedby="candidate-skills-hint candidate-skills-error" value={skills} onChange={(event) => setSkills(event.target.value)} rows={3} placeholder={t('candidate.skillsPlaceholder')} disabled={profileBusy} /><FieldError fields={profileResult.fields || {}} name="skills" id="candidate-skills-error" /></label>
        <p className="hint" id="candidate-skills-hint">{t('candidate.skillsHint')}</p>
        {profileResult.error && <p className="error" role="alert">{profileResult.error}<FieldError fields={profileResult.fields || {}} name="non_field_errors" /></p>}
        {profileResult.notice && <p className="notice" role="status">{profileResult.notice}</p>}
        <button className="primary" disabled={profileBusy}>{profileBusy ? t('candidate.savingProfile') : t('candidate.saveProfile')}</button>
      </form>
    </section>
    <section aria-labelledby="resume-title">
      <h2 id="resume-title">{t('candidate.resumeTitle')}</h2>
      <p className="muted">{t('candidate.resumeSubtitle')}</p>
      <form onSubmit={saveResume}>
        <label>{t('candidate.resumeLabel')}<textarea aria-label={t('candidate.resumeLabel')} aria-describedby="candidate-resume-error" value={resume} onChange={(event) => setResume(event.target.value)} rows={9} placeholder={t('candidate.resumePlaceholder')} disabled={resumeBusy} /><FieldError fields={resumeResult.fields || {}} name="resume_text" id="candidate-resume-error" /></label>
        {resumeResult.error && <p className="error" role="alert">{resumeResult.error}</p>}
        {resumeResult.notice && <p className="notice" role="status">{resumeResult.notice}</p>}
        <button className="primary" disabled={resumeBusy}>{resumeBusy ? t('candidate.savingResume') : t('candidate.saveResume')}</button>
      </form>
      <details className="resume-preview"><summary>{t('candidate.preview')}</summary><pre>{resume || t('candidate.resumeEmpty')}</pre></details>
    </section>
  </div>;
}

function Recommendations({ revision, onLoggedOut }) {
  const { t } = useI18n();
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([candidateApi.recommendations(controller.signal), applicationApi.list(controller.signal)])
      .then(([rows, ownApplications]) => {
        if (controller.signal.aborted) return;
        setJobs(rows);
        setApplications(ownApplications);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onLoggedOut();
        else setError(failure.message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision, attempt]);

  const applicationsByJob = new Map(applications.map((row) => [row.job.id, row]));
  return <section aria-labelledby="recommendations-title">
    <div className="application-header"><h2 id="recommendations-title">{t('candidate.jobsTitle')}</h2><button className="secondary" disabled={loading} onClick={() => setAttempt((value) => value + 1)}>{t('candidate.refreshJobs')}</button></div>
    <p className="muted">{t('candidate.jobsSubtitle')}</p>
    {notice && <p className="notice" role="status">{notice}</p>}
    {loading ? <p>{t('candidate.loadingJobs')}</p> : error ? <div><p className="error" role="alert">{error}</p><button className="secondary" onClick={() => setAttempt(attempt + 1)}>{t('candidate.reloadJobs')}</button></div> : jobs.length === 0 ? <p className="empty-state">{t('candidate.noJobs')}</p> : <div className="job-list">{jobs.map((job) => <article className="job-card" key={job.id}>
      <div className="job-heading"><h3>{job.title}</h3><span className="match-score" aria-label={t('candidate.matchScoreLabel', { score: job.match_score })}>{job.match_score}% <small>{t('candidate.matchUnit')}</small></span></div>
      <p className="job-company">{job.company}</p>
      <div className="skill-list">{job.required_skills.length ? job.required_skills.map((skill) => <span key={skill}>{skill}</span>) : <span>{t('candidate.noSkillRequirement')}</span>}</div>
      <details><summary>{t('candidate.viewDescription')}</summary><p className="job-description">{job.description}</p></details>
      {applicationsByJob.has(job.id) ? <p className="application-action">{t('candidate.applied')} · <ApplicationStatus status={applicationsByJob.get(job.id).status} /></p> : <ApplyButton jobId={job.id} onLoggedOut={onLoggedOut} onApplied={(row) => setApplications((current) => [...current, row])} onConflict={() => {
        setNotice(t('candidate.duplicateNotice'));
        setAttempt((value) => value + 1);
      }} />}
    </article>)}</div>}
  </section>;
}

export default function CandidateWorkspace({ user, onUserChanged, onLoggedOut }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('profile');
  const [revision, setRevision] = useState(0);
  return <div className="candidate-workspace">
    <AccountHome user={user} onUserChanged={onUserChanged} onLoggedOut={onLoggedOut} />
    <section className="auth-card workspace-content">
      <nav className="tabs workspace-tabs" aria-label={t('candidate.tabsLabel')}>
        <button className={tab === 'profile' ? 'active' : ''} aria-pressed={tab === 'profile'} onClick={() => setTab('profile')}>{t('candidate.tabProfile')}</button>
        <button className={tab === 'jobs' ? 'active' : ''} aria-pressed={tab === 'jobs'} onClick={() => setTab('jobs')}>{t('candidate.tabJobs')}</button>
        <button className={tab === 'applications' ? 'active' : ''} aria-pressed={tab === 'applications'} onClick={() => setTab('applications')}>{t('candidate.tabApplications')}</button>
        <button className={tab === 'bookings' ? 'active' : ''} aria-pressed={tab === 'bookings'} onClick={() => setTab('bookings')}>{t('candidate.tabBookings')}</button>
      </nav>
      <div hidden={tab !== 'profile'}><ProfileEditor onUserChanged={onUserChanged} onLoggedOut={onLoggedOut} onSkillsSaved={() => setRevision((value) => value + 1)} /></div>
      {tab === 'jobs' && <Recommendations revision={revision} onLoggedOut={onLoggedOut} />}
      {tab === 'applications' && <Applications onLoggedOut={onLoggedOut} onBrowseJobs={() => setTab('jobs')} />}
      {tab === 'bookings' && <BookingPanel role="Candidate" onLoggedOut={onLoggedOut} />}
    </section>
  </div>;
}
