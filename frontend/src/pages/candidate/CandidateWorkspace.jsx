import { useEffect, useState } from 'react';
import { candidateApi } from '../../api/candidate';
import AccountHome from '../../components/AccountHome';

function FieldError({ fields, name, id }) {
  return fields[name] ? <span className="field-error" id={id}>{[].concat(fields[name]).join(' ')}</span> : null;
}

function ProfileEditor({ onUserChanged, onSkillsSaved, onLoggedOut }) {
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
      setProfileResult({ notice: '资料已保存。' });
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
      setResumeResult({ notice: '简历已保存，仅你本人可以访问。' });
    } catch (failure) {
      if (failure.status === 401) onLoggedOut();
      else setResumeResult({ error: failure.message, fields: failure.fields });
    } finally { setResumeBusy(false); }
  }

  if (loading) return <p className="muted">正在加载个人资料…</p>;
  if (loadError) return <div><p className="error" role="alert">{loadError}</p><button className="secondary" onClick={() => setAttempt(attempt + 1)}>重新加载资料</button></div>;
  return <div className="editor-sections">
    <section aria-labelledby="profile-title">
      <h2 id="profile-title">个人资料</h2>
      <p className="muted">保存你的技术技能，用于计算岗位匹配分数。</p>
      <form onSubmit={saveProfile}>
        <label>显示名称<input aria-label="显示名称" aria-describedby="candidate-name-error" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} disabled={profileBusy} /><FieldError fields={profileResult.fields || {}} name="display_name" id="candidate-name-error" /></label>
        <label>技术技能<textarea aria-label="技术技能" aria-describedby="candidate-skills-hint candidate-skills-error" value={skills} onChange={(event) => setSkills(event.target.value)} rows={3} placeholder="Python, SQL, React" disabled={profileBusy} /><FieldError fields={profileResult.fields || {}} name="skills" id="candidate-skills-error" /></label>
        <p className="hint" id="candidate-skills-hint">使用中文或英文逗号、换行分隔；保存时会统一大小写并去重。没有技能也可以保存。</p>
        {profileResult.error && <p className="error" role="alert">{profileResult.error}<FieldError fields={profileResult.fields || {}} name="non_field_errors" /></p>}
        {profileResult.notice && <p className="notice" role="status">{profileResult.notice}</p>}
        <button className="primary" disabled={profileBusy}>{profileBusy ? '正在保存资料…' : '保存资料'}</button>
      </form>
    </section>
    <section aria-labelledby="resume-title">
      <h2 id="resume-title">私有简历</h2>
      <p className="muted">只有你本人可以查看和修改。简历正文不参与岗位评分。</p>
      <form onSubmit={saveResume}>
        <label>文字简历<textarea aria-label="文字简历" aria-describedby="candidate-resume-error" value={resume} onChange={(event) => setResume(event.target.value)} rows={9} placeholder="写下你的经历与项目…" disabled={resumeBusy} /><FieldError fields={resumeResult.fields || {}} name="resume_text" id="candidate-resume-error" /></label>
        {resumeResult.error && <p className="error" role="alert">{resumeResult.error}</p>}
        {resumeResult.notice && <p className="notice" role="status">{resumeResult.notice}</p>}
        <button className="primary" disabled={resumeBusy}>{resumeBusy ? '正在保存简历…' : '保存简历'}</button>
      </form>
      <details className="resume-preview"><summary>纯文本预览</summary><pre>{resume || '尚未填写文字简历。'}</pre></details>
    </section>
  </div>;
}

function Recommendations({ revision, onLoggedOut }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    candidateApi.recommendations(controller.signal)
      .then((rows) => { if (!controller.signal.aborted) setJobs(rows); })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onLoggedOut();
        else setError(failure.message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision, attempt]);

  return <section aria-labelledby="recommendations-title">
    <h2 id="recommendations-title">岗位推荐</h2>
    <p className="muted">展示全部当前岗位，按你已保存的技能计算匹配分数。</p>
    {loading ? <p>正在加载岗位…</p> : error ? <div><p className="error" role="alert">{error}</p><button className="secondary" onClick={() => setAttempt(attempt + 1)}>重新加载岗位</button></div> : jobs.length === 0 ? <p className="empty-state">暂时没有岗位，之后再来看看。</p> : <div className="job-list">{jobs.map((job) => <article className="job-card" key={job.id}>
      <div className="job-heading"><h3>{job.title}</h3><span className="match-score" aria-label={`匹配分 ${job.match_score} 分`}>{job.match_score}% <small>匹配</small></span></div>
      <p className="job-company">{job.company}</p>
      <div className="skill-list">{job.required_skills.length ? job.required_skills.map((skill) => <span key={skill}>{skill}</span>) : <span>无技能要求</span>}</div>
      <details><summary>查看岗位描述</summary><p className="job-description">{job.description}</p></details>
    </article>)}</div>}
  </section>;
}

export default function CandidateWorkspace({ user, onUserChanged, onLoggedOut }) {
  const [tab, setTab] = useState('profile');
  const [revision, setRevision] = useState(0);
  return <div className="candidate-workspace">
    <AccountHome user={user} onUserChanged={onUserChanged} onLoggedOut={onLoggedOut} />
    <section className="auth-card workspace-content">
      <nav className="tabs workspace-tabs" aria-label="求职者功能">
        <button className={tab === 'profile' ? 'active' : ''} aria-pressed={tab === 'profile'} onClick={() => setTab('profile')}>个人资料</button>
        <button className={tab === 'jobs' ? 'active' : ''} aria-pressed={tab === 'jobs'} onClick={() => setTab('jobs')}>岗位推荐</button>
      </nav>
      <div hidden={tab !== 'profile'}><ProfileEditor onUserChanged={onUserChanged} onLoggedOut={onLoggedOut} onSkillsSaved={() => setRevision((value) => value + 1)} /></div>
      {tab === 'jobs' && <Recommendations revision={revision} onLoggedOut={onLoggedOut} />}
    </section>
  </div>;
}
