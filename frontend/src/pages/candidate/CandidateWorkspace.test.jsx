import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../App';
import { authApi } from '../../api/auth';
import { candidateApi } from '../../api/candidate';
import { applicationApi } from '../../api/applications';
import { ApiError } from '../../api/client';
import { employerApi } from '../../api/employer';
import { availabilityApi } from '../../api/scheduling';

vi.mock('../../api/auth', () => ({ authApi: { me: vi.fn(), logout: vi.fn(), workspace: vi.fn() } }));
vi.mock('../../api/candidate', () => ({ candidateApi: {
  profile: vi.fn(), resume: vi.fn(), saveProfile: vi.fn(), saveResume: vi.fn(), recommendations: vi.fn(),
} }));
vi.mock('../../api/applications', () => ({ applicationApi: { list: vi.fn(), apply: vi.fn() } }));

vi.mock('../../api/employer', () => ({ employerApi: { getCompany: vi.fn(), listJobs: vi.fn(), saveCompany: vi.fn(), createJob: vi.fn(), updateJob: vi.fn(), deleteJob: vi.fn() } }));
vi.mock('../../api/scheduling', () => ({ availabilityApi: { jobs: vi.fn(), list: vi.fn(), create: vi.fn(), remove: vi.fn() } }));
const user = { id: 1, username: 'alice', email: 'alice@example.test', display_name: 'Alice', role: 'Candidate' };
const job = { id: 7, title: 'Backend', company: 'Demo Company', description: 'Build services', required_skills: ['Python', 'SQL'], match_score: 50 };

beforeEach(() => {
  vi.resetAllMocks();
  employerApi.getCompany.mockRejectedValue(new ApiError('Not found', { status: 404 }));
  employerApi.listJobs.mockResolvedValue([]);
  availabilityApi.jobs.mockResolvedValue([]);
  availabilityApi.list.mockResolvedValue([]);
  authApi.me.mockResolvedValue(user);
  candidateApi.profile.mockResolvedValue({ user_id: 1, display_name: 'Alice', skills: ['python'] });
  candidateApi.resume.mockResolvedValue({ user_id: 1, resume_text: 'Saved private resume' });
  candidateApi.recommendations.mockResolvedValue([job]);
  applicationApi.list.mockResolvedValue([]);
});

it('saves profile using server-normalized values, updates account identity and refreshes recommendation scores', async () => {
  candidateApi.recommendations.mockResolvedValueOnce([job]).mockResolvedValueOnce([{ ...job, match_score: 100 }]);
  candidateApi.saveProfile.mockResolvedValue({ user_id: 1, display_name: 'Updated Alice', skills: ['python', 'sql'] });
  render(<App />);
  await screen.findByLabelText('技术技能');
  fireEvent.click(screen.getByRole('button', { name: '岗位推荐', exact: true }));
  expect(await screen.findByLabelText('匹配分 50 分')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '个人资料', exact: true }));
  fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: ' Updated Alice ' } });
  fireEvent.change(screen.getByLabelText('技术技能'), { target: { value: ' Python，SQL\npython' } });
  fireEvent.change(screen.getByLabelText('文字简历'), { target: { value: 'unsaved resume draft' } });
  fireEvent.click(screen.getByRole('button', { name: '保存资料', exact: true }));
  await screen.findByText('资料已保存。');
  expect(candidateApi.saveProfile).toHaveBeenCalledWith({ display_name: ' Updated Alice ', skills: [' Python', 'SQL', 'python'] });
  expect(screen.getByLabelText('技术技能')).toHaveValue('python, sql');
  expect(screen.getByLabelText('文字简历')).toHaveValue('unsaved resume draft');
  expect(screen.getByRole('heading', { name: '你好，Updated Alice' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '岗位推荐', exact: true }));
  expect(await screen.findByLabelText('匹配分 100 分')).toBeVisible();
  expect(candidateApi.recommendations).toHaveBeenCalledTimes(2);
});

it('preserves raw resume whitespace, escapes its preview and saves independently of profile drafts', async () => {
  const raw = '  <script>alert(1)</script>\n中文经历  ';
  candidateApi.saveResume.mockResolvedValue({ user_id: 1, resume_text: raw });
  render(<App />);
  const resume = await screen.findByLabelText('文字简历');
  fireEvent.change(screen.getByLabelText('技术技能'), { target: { value: 'unsaved skill' } });
  fireEvent.change(resume, { target: { value: raw } });
  fireEvent.click(screen.getByText('纯文本预览'));
  expect(document.querySelector('.resume-preview pre').textContent).toBe(raw);
  expect(document.querySelector('script')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '保存简历', exact: true }));
  await screen.findByText('简历已保存，仅你本人可以访问。');
  expect(candidateApi.saveResume).toHaveBeenCalledWith(raw);
  expect(candidateApi.saveProfile).not.toHaveBeenCalled();
  expect(screen.getByLabelText('技术技能')).toHaveValue('unsaved skill');
});

it('keeps drafts and displays field errors after a rejected save', async () => {
  candidateApi.saveProfile.mockRejectedValue(new ApiError('Check the submitted fields.', { status: 400, fields: { skills: ['Skill is too long.'] } }));
  render(<App />);
  await screen.findByLabelText('技术技能');
  fireEvent.change(screen.getByLabelText('技术技能'), { target: { value: 'invalid skill' } });
  fireEvent.change(screen.getByLabelText('文字简历'), { target: { value: 'keep draft' } });
  fireEvent.click(screen.getByRole('button', { name: '保存资料', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Check the submitted fields.');
  expect(screen.getByText('Skill is too long.')).toBeVisible();
  expect(screen.getByLabelText('技术技能')).toHaveValue('invalid skill');
  expect(screen.getByLabelText('文字简历')).toHaveValue('keep draft');
  expect(screen.getByRole('button', { name: '保存资料', exact: true })).toBeEnabled();
});

it('prevents repeated profile submits while allowing independent resume editing', async () => {
  let finish;
  candidateApi.saveProfile.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<App />);
  await screen.findByLabelText('技术技能');
  fireEvent.click(screen.getByRole('button', { name: '保存资料', exact: true }));
  const saving = screen.getByRole('button', { name: '正在保存资料…' });
  expect(saving).toBeDisabled();
  fireEvent.click(saving);
  expect(candidateApi.saveProfile).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('文字简历')).toBeEnabled();
  await act(async () => { finish({ display_name: 'Alice', skills: ['python'] }); });
  expect(screen.getByRole('button', { name: '保存资料', exact: true })).toBeEnabled();
});

it('returns to login when a private write discovers the session has expired', async () => {
  candidateApi.saveResume.mockRejectedValue(new ApiError('Please log in', { status: 401 }));
  render(<App />);
  await screen.findByLabelText('文字简历');
  fireEvent.click(screen.getByRole('button', { name: '保存简历', exact: true }));
  expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeVisible();
});

it('retries a failed profile load without submitting an empty form', async () => {
  candidateApi.profile.mockRejectedValueOnce(new ApiError('Profile unavailable')).mockResolvedValueOnce({ display_name: 'Alice', skills: [] });
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Profile unavailable');
  expect(screen.queryByRole('button', { name: '保存资料', exact: true })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重新加载资料' }));
  expect(await screen.findByLabelText('技术技能')).toHaveValue('');
});

it('retries recommendations and shows the empty state', async () => {
  candidateApi.recommendations.mockRejectedValueOnce(new ApiError('Jobs unavailable')).mockResolvedValueOnce([]);
  render(<App />);
  await screen.findByLabelText('技术技能');
  fireEvent.click(screen.getByRole('button', { name: '岗位推荐', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Jobs unavailable');
  fireEvent.click(screen.getByRole('button', { name: '重新加载岗位' }));
  expect(await screen.findByText('暂时没有岗位，之后再来看看。')).toBeVisible();
});

it('renders zero-score jobs, empty requirements and escaped job text in server order', async () => {
  const title = '<script>alert(1)</script>';
  candidateApi.recommendations.mockResolvedValue([{ ...job, id: 8, title: 'Open role', required_skills: [], match_score: 100 }, { ...job, title, match_score: 0 }]);
  render(<App />);
  await screen.findByLabelText('技术技能');
  fireEvent.click(screen.getByRole('button', { name: '岗位推荐', exact: true }));
  await screen.findByRole('heading', { name: 'Open role' });
  const cards = screen.getAllByRole('article');
  expect(within(cards[0]).getByRole('heading')).toHaveTextContent('Open role');
  expect(within(cards[1]).getByRole('heading')).toHaveTextContent(title);
  expect(screen.getByLabelText('匹配分 0 分')).toBeVisible();
  expect(screen.getByText('无技能要求')).toBeVisible();
  expect(document.querySelector('script')).toBeNull();
  fireEvent.click(within(cards[1]).getByText('查看岗位描述'));
  expect(within(cards[1]).getByText('Build services')).toBeVisible();
});

it('does not replace newer recommendation results with an abandoned request', async () => {
  let finishOld;
  candidateApi.recommendations.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; })).mockResolvedValueOnce([{ ...job, title: 'Latest result' }]);
  render(<App />);
  await screen.findByLabelText('技术技能');
  fireEvent.click(screen.getByRole('button', { name: '岗位推荐', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: '个人资料', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: '岗位推荐', exact: true }));
  await screen.findByRole('heading', { name: 'Latest result' });
  await act(async () => { finishOld([{ ...job, title: 'Abandoned result' }]); });
  expect(screen.queryByRole('heading', { name: 'Abandoned result' })).not.toBeInTheDocument();
});

it('keeps employer account controls without loading candidate-only resources', async () => {
  authApi.me.mockResolvedValue({ ...user, role: 'Employer' });
  render(<App />);
  await screen.findByRole('heading', { name: '你好，Alice' });
  expect(screen.getByRole('button', { name: '退出登录' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '岗位推荐', exact: true })).not.toBeInTheDocument();
  expect(candidateApi.profile).not.toHaveBeenCalled();
});

const application = { id: 12, job, status: 'Pending', booking: null };

it('applies once, shows the returned Pending status and reloads the application in the own-list tab', async () => {
  let finish;
  applicationApi.apply.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  applicationApi.list.mockResolvedValueOnce([]).mockResolvedValueOnce([application]);
  render(<App />);
  await screen.findByLabelText('技术技能');
  fireEvent.click(screen.getByRole('button', { name: '岗位推荐', exact: true }));
  const apply = await screen.findByRole('button', { name: '投递岗位', exact: true });
  fireEvent.click(apply);
  expect(screen.getByRole('button', { name: '正在投递…' })).toBeDisabled();
  fireEvent.click(apply);
  expect(applicationApi.apply).toHaveBeenCalledTimes(1);
  expect(applicationApi.apply).toHaveBeenCalledWith(7);
  await act(async () => { finish(application); });
  expect(await screen.findByText('Pending · 待处理')).toBeVisible();
  expect(screen.queryByRole('button', { name: '投递岗位', exact: true })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '我的申请', exact: true }));
  expect(await screen.findByText('申请编号 #12')).toBeVisible();
  expect(screen.getByText('Demo Company')).toBeVisible();
  expect(screen.getByText('尚无面试预约。')).toBeVisible();
});

it('reconciles a stale duplicate conflict with the actual server application without retrying the write', async () => {
  applicationApi.list.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...application, status: 'Accepted' }]);
  applicationApi.apply.mockRejectedValue(new ApiError('Already applied', { status: 409, code: 'application_conflict' }));
  render(<App />);
  await screen.findByLabelText('技术技能');
  fireEvent.click(screen.getByRole('button', { name: '岗位推荐', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: '投递岗位', exact: true }));
  expect(await screen.findByText('Accepted · 已录用')).toBeVisible();
  expect(screen.getByText('你已投递过该岗位。')).toBeVisible();
  expect(applicationApi.apply).toHaveBeenCalledTimes(1);
});

it('keeps a failed application retryable and handles a deleted posting through a read refresh', async () => {
  applicationApi.apply.mockRejectedValueOnce(new ApiError('Network unavailable')).mockRejectedValueOnce(new ApiError('Missing', { status: 404 }));
  candidateApi.recommendations.mockResolvedValueOnce([job]).mockResolvedValueOnce([]);
  render(<App />);
  await screen.findByLabelText('技术技能');
  fireEvent.click(screen.getByRole('button', { name: '岗位推荐', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: '投递岗位', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
  expect(screen.getByRole('button', { name: '投递岗位', exact: true })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '投递岗位', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('该岗位已不存在，请刷新岗位列表。');
  fireEvent.click(screen.getByRole('button', { name: '刷新岗位' }));
  expect(await screen.findByText('暂时没有岗位，之后再来看看。')).toBeVisible();
  expect(applicationApi.apply).toHaveBeenCalledTimes(2);
});

it('shows all four statuses and retains a booking after its application leaves Interviewing, escaping text', async () => {
  const unsafe = '<script>alert(1)</script>';
  applicationApi.list.mockResolvedValue(['Pending', 'Interviewing', 'Rejected', 'Accepted'].map((status, index) => ({
    ...application, id: index + 1, status, job: { ...job, title: index === 2 ? unsafe : status, company: unsafe, description: unsafe },
    booking: index === 2 ? { id: 23, slot_id: 45, start_at: '2026-11-04T01:00:00Z', end_at: '2026-11-04T01:30:00Z' } : null,
  })));
  render(<App />);
  await screen.findByLabelText('技术技能');
  fireEvent.click(screen.getByRole('button', { name: '我的申请', exact: true }));
  expect(await screen.findByText('Pending · 待处理')).toBeVisible();
  expect(screen.getByText('Interviewing · 面试中')).toBeVisible();
  expect(screen.getByText('Rejected · 已拒绝')).toBeVisible();
  expect(screen.getByText('Accepted · 已录用')).toBeVisible();
  expect(screen.getByText('预约编号 #23 · 时段 #45')).toBeVisible();
  expect(screen.getByText(/2026\/11\/04 09:00 ～ 2026\/11\/04 09:30/)).toBeVisible();
  expect(screen.getByText('北京时间（UTC+8）')).toBeVisible();
  expect(screen.getByRole('heading', { name: unsafe })).toBeVisible();
  expect(document.querySelector('script')).toBeNull();
  expect(screen.queryByRole('combobox')).toBeNull();
});

it('retries the own-list read, supports an empty state and refreshes a changed status', async () => {
  applicationApi.list.mockRejectedValueOnce(new ApiError('Applications unavailable')).mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...application, status: 'Interviewing' }]);
  render(<App />);
  await screen.findByLabelText('技术技能');
  fireEvent.click(screen.getByRole('button', { name: '我的申请', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Applications unavailable');
  fireEvent.click(screen.getByRole('button', { name: '重新加载申请' }));
  expect(await screen.findByText('你还没有投递岗位。')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '刷新申请' }));
  expect(await screen.findByText('Interviewing · 面试中')).toBeVisible();
});

it.each(['read', 'apply'])('returns to login on application %s session expiry', async (operation) => {
  if (operation === 'read') applicationApi.list.mockRejectedValue(new ApiError('Expired', { status: 401 }));
  else applicationApi.apply.mockRejectedValue(new ApiError('Expired', { status: 401 }));
  render(<App />);
  await screen.findByLabelText('技术技能');
  fireEvent.click(screen.getByRole('button', { name: operation === 'read' ? '我的申请' : '岗位推荐', exact: true }));
  if (operation === 'apply') fireEvent.click(await screen.findByRole('button', { name: '投递岗位', exact: true }));
  expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeVisible();
});

it('ignores an abandoned own-list response after switching tabs', async () => {
  let finishOld;
  applicationApi.list.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; })).mockResolvedValueOnce([{ ...application, status: 'Accepted' }]);
  render(<App />);
  await screen.findByLabelText('技术技能');
  fireEvent.click(screen.getByRole('button', { name: '我的申请', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: '个人资料', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: '我的申请', exact: true }));
  await screen.findByText('Accepted · 已录用');
  await act(async () => { finishOld([application]); });
  expect(screen.queryByText('Pending · 待处理')).toBeNull();
});
