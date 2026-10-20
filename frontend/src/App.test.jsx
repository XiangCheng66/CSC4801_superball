import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { authApi } from './api/auth';
import { ApiError } from './api/client';

vi.mock('./api/auth', () => ({ authApi: { me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), workspace: vi.fn() } }));
const user = { id: 1, username: 'alice', email: 'alice@example.test', display_name: 'Alice', role: 'Candidate' };

beforeEach(() => {
  vi.resetAllMocks();
  authApi.me.mockRejectedValue(new ApiError('Please log in', { status: 401 }));
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
