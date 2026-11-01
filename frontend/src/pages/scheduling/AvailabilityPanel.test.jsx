import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { availabilityApi } from '../../api/scheduling';
import AvailabilityPanel from './AvailabilityPanel';
import { slotTimes } from './time';

vi.mock('../../api/scheduling', () => ({ availabilityApi: { jobs: vi.fn(), list: vi.fn(), create: vi.fn(), remove: vi.fn() } }));
const jobs = [{ id: 7, title: 'Developer' }];
const future = { id: 8, job_id: 7, job_title: 'Developer', start_at: '2099-01-02T01:00:00Z', end_at: '2099-01-02T01:30:00Z', is_booked: false, is_available: true };

beforeEach(() => {
  vi.resetAllMocks();
  availabilityApi.jobs.mockResolvedValue(jobs);
  availabilityApi.list.mockResolvedValue([]);
});

it('creates a future half-hour slot using Beijing input and refreshes persisted data', async () => {
  availabilityApi.create.mockResolvedValue(future);
  render(<AvailabilityPanel onLoggedOut={vi.fn()} />);
  const input = await screen.findByLabelText('开始时间（北京时间）');
  fireEvent.change(input, { target: { value: '2099-01-02T09:00' } });
  expect(screen.getByText(/结束时间：2099/)).toHaveTextContent('09:30');
  availabilityApi.list.mockResolvedValue([future]);
  fireEvent.click(screen.getByRole('button', { name: '创建时段' }));
  await screen.findByText('时段已创建。');
  expect(availabilityApi.create).toHaveBeenCalledWith({ job_id: 7, start_at: '2099-01-02T01:00:00.000Z', end_at: '2099-01-02T01:30:00.000Z' });
  expect(await screen.findByText('可预约', { exact: true })).toBeInTheDocument();
  expect(input).toHaveValue('');
});

it('asks before deleting and removes only after the server succeeds', async () => {
  availabilityApi.list.mockResolvedValue([future]);
  availabilityApi.remove.mockResolvedValue({ message: 'Slot deleted.' });
  render(<AvailabilityPanel onLoggedOut={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /删除时段/ }));
  expect(availabilityApi.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(availabilityApi.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /删除时段/ }));
  availabilityApi.list.mockResolvedValue([]);
  fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
  await screen.findByText('时段已删除。');
  expect(availabilityApi.remove).toHaveBeenCalledWith(8);
  await waitFor(() => expect(screen.queryByRole('list', { name: '我的面试时段' })).not.toBeInTheDocument());
});

it('refreshes after a booking conflict and keeps the booked slot visible', async () => {
  availabilityApi.list.mockResolvedValueOnce([future]).mockResolvedValue([{ ...future, is_booked: true, is_available: false }]);
  availabilityApi.remove.mockRejectedValue(new ApiError('A booked slot cannot be deleted.', { status: 409, code: 'slot_booked' }));
  render(<AvailabilityPanel onLoggedOut={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /删除时段/ }));
  fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('已被预约');
  await screen.findByText('已预约', { exact: true });
  expect(screen.queryByRole('button', { name: /删除/ })).not.toBeInTheDocument();
});

it('keeps input after validation errors and displays server field messages', async () => {
  availabilityApi.create.mockRejectedValue(new ApiError('Check fields.', { status: 400, fields: { start_at: ['The slot must start in the future.'] } }));
  render(<AvailabilityPanel onLoggedOut={vi.fn()} />);
  const input = await screen.findByLabelText('开始时间（北京时间）');
  fireEvent.change(input, { target: { value: '2099-01-02T09:00' } });
  fireEvent.click(screen.getByRole('button', { name: '创建时段' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The slot must start in the future.');
  expect(input).toHaveValue('2099-01-02T09:00');
  expect(screen.getByRole('button', { name: '创建时段' })).toBeEnabled();
});

it('rejects past input before submitting', async () => {
  render(<AvailabilityPanel onLoggedOut={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText('开始时间（北京时间）'), { target: { value: '2000-01-01T09:00' } });
  fireEvent.submit(screen.getByRole('form', { name: '新增面试时段' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('开始时间必须晚于当前时间');
  expect(availabilityApi.create).not.toHaveBeenCalled();
});

it('offers a refresh after load failure without an editable form', async () => {
  availabilityApi.list.mockRejectedValueOnce(new ApiError('Service unavailable')).mockResolvedValue([]);
  render(<AvailabilityPanel onLoggedOut={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
  expect(screen.queryByRole('button', { name: '创建时段' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '刷新时段' }));
  await screen.findByLabelText('所属岗位');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('handles expired sessions', async () => {
  const logout = vi.fn();
  availabilityApi.list.mockRejectedValue(new ApiError('Please log in', { status: 401 }));
  render(<AvailabilityPanel onLoggedOut={logout} />);
  await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
});

it('shows the no-jobs state and cannot create a slot', async () => {
  availabilityApi.jobs.mockResolvedValue([]);
  render(<AvailabilityPanel onLoggedOut={vi.fn()} />);
  await screen.findByText(/你还没有岗位/);
  expect(screen.queryByRole('button', { name: '创建时段' })).not.toBeInTheDocument();
});

it('shows booked and past slots without deletion controls and escapes titles', async () => {
  availabilityApi.list.mockResolvedValue([
    { ...future, job_title: '<script>alert(1)</script>', is_booked: true, is_available: false },
    { ...future, id: 9, start_at: '2000-01-01T01:00:00Z', end_at: '2000-01-01T01:30:00Z', is_available: false },
  ]);
  render(<AvailabilityPanel onLoggedOut={vi.fn()} />);
  const list = await screen.findByRole('list', { name: '我的面试时段' });
  expect(within(list).getByText('<script>alert(1)</script>')).toBeInTheDocument();
  expect(within(list).queryByRole('button')).not.toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByText('0 个可预约')).toBeInTheDocument();
});

it('converts midnight and rejects invalid dates independently of browser timezone', () => {
  expect(slotTimes('2099-01-02T23:45')).toEqual({ start_at: '2099-01-02T15:45:00.000Z', end_at: '2099-01-02T16:15:00.000Z' });
  expect(() => slotTimes('2099-02-30T09:00')).toThrow('有效的日期');
  expect(() => slotTimes('')).toThrow('完整的开始时间');
});
