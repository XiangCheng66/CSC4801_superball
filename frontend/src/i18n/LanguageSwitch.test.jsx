import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../App';
import { authApi } from '../api/auth';
import { ApiError } from '../api/client';

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), workspace: vi.fn() } }));
vi.mock('../api/candidate', () => ({ candidateApi: { profile: vi.fn(), resume: vi.fn(), recommendations: vi.fn(), saveProfile: vi.fn(), saveResume: vi.fn() } }));
vi.mock('../api/applications', () => ({ applicationApi: { list: vi.fn(), apply: vi.fn() } }));
vi.mock('../api/employer', () => ({ employerApi: { getCompany: vi.fn(), listJobs: vi.fn(), saveCompany: vi.fn(), createJob: vi.fn(), updateJob: vi.fn(), deleteJob: vi.fn(), listApplicants: vi.fn(), updateApplicationStatus: vi.fn() } }));
vi.mock('../api/scheduling', () => ({ availabilityApi: { jobs: vi.fn(), list: vi.fn(), create: vi.fn(), remove: vi.fn() } }));
vi.mock('../api/bookings', () => ({ bookingApi: { list: vi.fn(), applications: vi.fn(), slots: vi.fn(), create: vi.fn() } }));

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  // Signed out: the login card is enough to check every piece of chrome.
  authApi.me.mockRejectedValue(new ApiError('Please log in', { status: 401 }));
});

afterEach(() => { localStorage.clear(); });

it('defaults to Chinese and switches the whole shell to English', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '切换到英文' })).toBeInTheDocument();
  expect(screen.getByText('CSC4801 · 招聘与求职')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '切换到英文' }));

  const heading = await screen.findByRole('heading', { name: 'Welcome back' });
  expect(heading).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.getByText('CSC4801 · Recruiting & Matching')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Switch to Chinese' })).toBeInTheDocument();
});

it('keeps product names, the brand and the status vocabulary untranslated', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: '切换到英文' }));

  // Brand and footer keep the product name in both languages.
  expect(screen.getByLabelText('Superball home')).toBeInTheDocument();
  expect(screen.getByText('Superball / Recruiting & Candidate Matching')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  const role = screen.getByLabelText('Role');
  expect(role).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Candidate' })).toHaveValue('Candidate');
  expect(screen.getByRole('option', { name: 'Employer' })).toHaveValue('Employer');
});

it('switches back to Chinese and persists the choice for the next visit', async () => {
  const { unmount } = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: '切换到英文' }));
  await screen.findByRole('heading', { name: 'Welcome back' });
  expect(localStorage.getItem('superball.lang')).toBe('en');

  fireEvent.click(screen.getByRole('button', { name: 'Switch to Chinese' }));
  expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
  expect(localStorage.getItem('superball.lang')).toBe('zh');

  unmount();
  localStorage.setItem('superball.lang', 'en');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
});

it('shows Chinese role labels with the API value in Chinese mode only', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: '创建账号' }));
  expect(await screen.findByRole('option', { name: '求职者 Candidate' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: '雇主 Employer' })).toBeInTheDocument();
});
