import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { authApi } from './api/auth';
import { ApiError } from './api/client';
import { employerApi } from './api/employer';
import { availabilityApi } from './api/scheduling';
import { candidateApi } from './api/candidate';

vi.mock('./api/auth', () => ({ authApi: { me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), workspace: vi.fn() } }));
vi.mock('./api/candidate', () => ({ candidateApi: { profile: vi.fn(), resume: vi.fn(), saveProfile: vi.fn() } }));
vi.mock('./api/employer', () => ({ employerApi: { getCompany: vi.fn(), listJobs: vi.fn(), saveCompany: vi.fn(), createJob: vi.fn(), updateJob: vi.fn(), deleteJob: vi.fn() } }));
vi.mock('./api/scheduling', () => ({ availabilityApi: { jobs: vi.fn(), list: vi.fn(), create: vi.fn(), remove: vi.fn() } }));
const user = { id: 1, username: 'alice', email: 'alice@example.test', display_name: 'Alice', role: 'Candidate' };

beforeEach(() => {
  vi.resetAllMocks();
  employerApi.getCompany.mockRejectedValue(new ApiError('Not found', { status: 404 }));
  employerApi.listJobs.mockResolvedValue([]);
  availabilityApi.jobs.mockResolvedValue([]);
  availabilityApi.list.mockResolvedValue([]);
  authApi.me.mockRejectedValue(new ApiError('Please log in', { status: 401 }));
  candidateApi.profile.mockResolvedValue({ user_id: 1, display_name: 'Alice', skills: [] });
  candidateApi.resume.mockResolvedValue({ user_id: 1, resume_text: '' });
});

it('shows login for an anonymous visitor and logs in with submitted credentials', async () => {
  authApi.login.mockResolvedValue(user);
  render(<App />);
  await screen.findByRole('heading', { name: '欢迎回来' });
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'alice' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: '登录账号' }));
  await screen.findByRole('heading', { name: '你好，Alice' });
  expect(authApi.login).toHaveBeenCalledWith({ username: 'alice', password: 'secret' });
});

it('submits the selected registration role and escapes user-controlled display names', async () => {
  authApi.register.mockResolvedValue({ ...user, role: 'Employer', display_name: '<script>alert(1)</script>' });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: '创建账号' }));
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'alice' } });
  fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '<script>alert(1)</script>' } });
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'alice@example.test' } });
  fireEvent.change(screen.getByLabelText('身份'), { target: { value: 'Employer' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'StrongPass!42' } });
  fireEvent.click(screen.getByRole('button', { name: '创建账号并登录' }));
  await screen.findByRole('heading', { name: '你好，<script>alert(1)</script>' });
  expect(authApi.register).toHaveBeenCalledWith(expect.objectContaining({ role: 'Employer' }));
  expect(document.querySelector('script')).toBeNull();
});

it('restores a stored session, reads current user data and logs out', async () => {
  authApi.me.mockResolvedValue(user);
  authApi.logout.mockResolvedValue({ message: 'Logged out.' });
  render(<App />);
  await screen.findByRole('heading', { name: '你好，Alice' });
  expect(screen.getByText('alice@example.test')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
  await screen.findByRole('heading', { name: '欢迎回来' });
  expect(authApi.logout).toHaveBeenCalledTimes(1);
});

it('discards the previous private workspace when an account refresh returns another candidate', async () => {
  const other = { ...user, id: 2, username: 'bob', email: 'bob@example.test', display_name: 'Bob' };
  authApi.me.mockResolvedValueOnce(user).mockResolvedValueOnce(other);
  candidateApi.profile.mockResolvedValueOnce({ user_id: 1, display_name: 'Alice', skills: [] })
    .mockResolvedValueOnce({ user_id: 2, display_name: 'Bob', skills: [] });
  candidateApi.resume.mockResolvedValueOnce({ user_id: 1, resume_text: 'Alice private draft' })
    .mockResolvedValueOnce({ user_id: 2, resume_text: 'Bob private draft' });
  render(<App />);
  await screen.findByDisplayValue('Alice private draft');
  fireEvent.click(screen.getByRole('button', { name: '刷新账号信息' }));
  await screen.findByRole('heading', { name: '你好，Bob' });
  expect(screen.queryByDisplayValue('Alice private draft')).not.toBeInTheDocument();
  expect(await screen.findByDisplayValue('Bob private draft')).toBeInTheDocument();
});

it('does not reopen a logged-out workspace when a previous profile save completes', async () => {
  let finishSave;
  authApi.me.mockResolvedValue(user);
  authApi.logout.mockResolvedValue({ message: 'Logged out.' });
  candidateApi.saveProfile.mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: '保存资料' }));
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
  await screen.findByRole('heading', { name: '欢迎回来' });
  await act(async () => finishSave({ user_id: 1, display_name: 'Old session', skills: [] }));
  expect(screen.getByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
});

it('ignores a previous session’s 401 after another candidate has logged in', async () => {
  let failSave;
  const other = { ...user, id: 2, username: 'bob', email: 'bob@example.test', display_name: 'Bob' };
  authApi.me.mockResolvedValue(user);
  authApi.logout.mockResolvedValue({ message: 'Logged out.' });
  authApi.login.mockResolvedValue(other);
  candidateApi.saveProfile.mockImplementation(() => new Promise((_, reject) => { failSave = reject; }));
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: '保存资料' }));
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
  await screen.findByRole('heading', { name: '欢迎回来' });
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'bob' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: '登录账号' }));
  await screen.findByRole('heading', { name: '你好，Bob' });
  await act(async () => failSave(new ApiError('Expired', { status: 401 })));
  expect(screen.getByRole('heading', { name: '你好，Bob' })).toBeInTheDocument();
});

it('shows API validation messages without losing the form', async () => {
  authApi.login.mockRejectedValue(new ApiError('Invalid username or password.', { status: 401, code: 'invalid_credentials' }));
  render(<App />);
  await screen.findByRole('heading', { name: '欢迎回来' });
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'alice' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: '登录账号' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password.');
  expect(screen.getByRole('button', { name: '登录账号' })).toBeEnabled();
});

it('offers a retry when the backend is unavailable', async () => {
  authApi.me.mockRejectedValueOnce(new ApiError('Service unavailable')).mockResolvedValueOnce(user);
  render(<App />);
  await screen.findByRole('heading', { name: '暂时无法连接' });
  fireEvent.click(screen.getByRole('button', { name: '重新连接' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: '你好，Alice' })).toBeInTheDocument());
});

it('integrates employer account controls, company/jobs and availability and refreshes the slot job picker after publishing', async () => {
  authApi.me.mockResolvedValue({ ...user, role: 'Employer' });
  authApi.logout.mockResolvedValue({ message: 'Logged out.' });
  employerApi.createJob.mockResolvedValue({ id: 88, title: 'Integrated role', description: 'Build services', required_skills: ['Python'] });
  render(<App />);
  await screen.findByLabelText('岗位标题');
  await screen.findByText(/你还没有岗位/);
  expect(screen.getAllByRole('heading', { name: '你好，Alice' })).toHaveLength(1);
  expect(screen.getByRole('heading', { name: '面试时段', exact: true })).toBeVisible();
  fireEvent.change(screen.getByLabelText('岗位标题'), { target: { value: 'Integrated role' } });
  fireEvent.change(screen.getByLabelText('岗位描述'), { target: { value: 'Build services' } });
  availabilityApi.jobs.mockResolvedValue([{ id: 88, title: 'Integrated role' }]);
  fireEvent.click(screen.getByRole('button', { name: '发布岗位', exact: true }));
  expect(await screen.findByRole('option', { name: 'Integrated role' })).toHaveValue('88');
  expect(employerApi.createJob).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
  expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeVisible();
  expect(authApi.logout).toHaveBeenCalledTimes(1);
});
