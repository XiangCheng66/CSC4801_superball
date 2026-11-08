import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import BookingPanel from './BookingPanel';
import { bookingApi } from '../../api/bookings';
import { ApiError } from '../../api/client';
vi.mock('../../api/bookings', () => ({ bookingApi: { applications: vi.fn(), slots: vi.fn(), list: vi.fn(), create: vi.fn() } }));
const slot = { id: 4, job_title: 'Interview', start_at: '2099-01-02T01:00:00Z', end_at: '2099-01-02T01:30:00Z' };
const booking = { ...slot, id: 8, application_id: 2, job_title: '<script>Job</script>', candidate_name: 'Alice' };
beforeEach(() => {
  vi.resetAllMocks();
  bookingApi.applications.mockResolvedValue([{ id: 2, job_title: 'Developer' }]);
  bookingApi.slots.mockResolvedValue([slot]);
  bookingApi.list.mockResolvedValue([]);
});
it('books once, blocks repeated events and reloads the persisted booking', async () => {
  let complete;
  bookingApi.create.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  render(<BookingPanel role="Candidate" onLoggedOut={vi.fn()} />);
  const button = await screen.findByRole('button', { name: /预约 2099/ });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(bookingApi.create).toHaveBeenCalledTimes(1);
  expect(bookingApi.create).toHaveBeenCalledWith(2, 4);
  bookingApi.list.mockResolvedValue([booking]);
  bookingApi.applications.mockResolvedValue([]);
  complete(booking);
  await screen.findByText('面试预约成功，请在下方查看时间。');
  await screen.findByText('<script>Job</script>');
  expect(document.querySelector('script')).toBeNull();
  expect(screen.queryByRole('button', { name: /预约 2099/ })).not.toBeInTheDocument();
});
it('reloads availability after a 409 without auto retrying the write', async () => {
  bookingApi.create.mockRejectedValue(new ApiError('Slot already booked', { status: 409, code: 'slot_already_booked' }));
  render(<BookingPanel role="Candidate" onLoggedOut={vi.fn()} />);
  const button = await screen.findByRole('button', { name: /预约 2099/ });
  bookingApi.slots.mockResolvedValue([]);
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('这个时段已被预约');
  await screen.findByText('这位雇主暂无可用时段，请稍后刷新。');
  expect(bookingApi.create).toHaveBeenCalledTimes(1);
});
it('offers refresh after a load error', async () => {
  bookingApi.list.mockRejectedValueOnce(new ApiError('Offline')).mockResolvedValue([]);
  render(<BookingPanel role="Candidate" onLoggedOut={vi.fn()} />);
  await screen.findByText('Offline');
  fireEvent.click(screen.getByRole('button', { name: '刷新预约' }));
  await screen.findByRole('button', { name: /预约 2099/ });
});
it('shows the empty state without booking controls', async () => {
  bookingApi.applications.mockResolvedValue([]);
  render(<BookingPanel role="Candidate" onLoggedOut={vi.fn()} />);
  await screen.findByText(/暂无可预约的申请/);
  expect(bookingApi.slots).not.toHaveBeenCalled();
});
it('logs out on expired sessions', async () => {
  const logout = vi.fn();
  bookingApi.list.mockRejectedValue(new ApiError('Expired', { status: 401 }));
  render(<BookingPanel role="Candidate" onLoggedOut={logout} />);
  await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
});
it('employers see bookings without candidate booking controls', async () => {
  bookingApi.list.mockResolvedValue([booking]);
  render(<BookingPanel role="Employer" onLoggedOut={vi.fn()} />);
  await screen.findByText('Alice');
  expect(screen.getByText(/2099\/01\/02 09:00/)).toBeInTheDocument();
  expect(bookingApi.applications).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('选择申请')).not.toBeInTheDocument();
});
it('ignores stale slot responses after changing application', async () => {
  let finishOld;
  bookingApi.applications.mockResolvedValue([{ id: 2, job_title: 'First' }, { id: 3, job_title: 'Second' }]);
  bookingApi.slots.mockImplementation((id) => String(id) === '2' ? new Promise((resolve) => { finishOld = resolve; }) : Promise.resolve([]));
  render(<BookingPanel role="Candidate" onLoggedOut={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText('选择申请'), { target: { value: '3' } });
  await screen.findByText('这位雇主暂无可用时段，请稍后刷新。');
  finishOld([slot]);
  await waitFor(() => expect(screen.queryByRole('button', { name: /预约 2099/ })).not.toBeInTheDocument());
});
