import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import EmployerWorkspace, { splitSkills } from './EmployerWorkspace';
import { employerApi } from '../../api/employer';
import { ApiError } from '../../api/client';

vi.mock('../../api/employer', () => ({
  employerApi: {
    getCompany: vi.fn(), saveCompany: vi.fn(), listJobs: vi.fn(),
    createJob: vi.fn(), updateJob: vi.fn(), deleteJob: vi.fn(),
    listApplicants: vi.fn(), updateApplicationStatus: vi.fn(),
  },
}));

const user = { id: 3, username: 'employer1', display_name: 'Demo Employer', role: 'Employer' };
const job = {
  id: 7,
  title: 'Backend Engineer',
  description: 'Build services.',
  required_skills: ['Python', 'SQL'],
  created_at: '2026-10-25T00:00:00Z',
  updated_at: '2026-10-25T00:00:00Z',
};
const notFound = new ApiError('Not found', { status: 404, code: 'not_found' });

beforeEach(() => {
  vi.resetAllMocks();
  employerApi.getCompany.mockRejectedValue(notFound);
  employerApi.listJobs.mockResolvedValue([]);
});

function renderWorkspace(props = {}) {
  return render(<EmployerWorkspace user={user} onLoggedOut={vi.fn()} {...props} />);
}

it('starts with an empty company form when no profile exists yet', async () => {
  renderWorkspace();

  expect(await screen.findByRole('heading', { name: '你好，Demo Employer' })).toBeInTheDocument();
  expect(screen.getByLabelText('公司名称')).toHaveValue('');
  expect(screen.getByText(/还没有岗位/)).toBeInTheDocument();
});

it('loads an existing company profile and job list', async () => {
  employerApi.getCompany.mockResolvedValue({ company_name: 'Superball Labs', description: 'We hire.' });
  employerApi.listJobs.mockResolvedValue([job]);
  renderWorkspace();

  await waitFor(() => expect(screen.getByLabelText('公司名称')).toHaveValue('Superball Labs'));
  expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
  expect(screen.getByText('技能：Python、SQL')).toBeInTheDocument();
});

it('saves the company profile through the API', async () => {
  employerApi.saveCompany.mockResolvedValue({ company_name: 'Superball Labs', description: 'We hire.' });
  renderWorkspace();

  fireEvent.change(await screen.findByLabelText('公司名称'), { target: { value: '  Superball Labs ' } });
  fireEvent.change(screen.getByLabelText('公司简介'), { target: { value: 'We hire.' } });
  fireEvent.click(screen.getByRole('button', { name: '保存公司资料' }));

  await screen.findByText('公司资料已保存。');
  expect(employerApi.saveCompany).toHaveBeenCalledWith({
    company_name: '  Superball Labs ',
    description: 'We hire.',
  });
});

it('publishes a job with parsed, deduplicated skills', async () => {
  employerApi.createJob.mockResolvedValue({ ...job, id: 9, title: 'Data Engineer' });
  renderWorkspace();

  fireEvent.change(await screen.findByLabelText('岗位标题'), { target: { value: 'Data Engineer' } });
  fireEvent.change(screen.getByLabelText('岗位描述'), { target: { value: 'Pipelines.' } });
  fireEvent.change(screen.getByLabelText('技能要求（逗号分隔，可留空）'), { target: { value: 'Python， python , SQL' } });
  fireEvent.click(screen.getByRole('button', { name: '发布岗位' }));

  await screen.findByText('已发布「Data Engineer」。');
  expect(employerApi.createJob).toHaveBeenCalledWith({
    title: 'Data Engineer',
    description: 'Pipelines.',
    required_skills: ['Python', 'SQL'],
  });
  expect(screen.getByText(/我的岗位（1）/)).toBeInTheDocument();
});

it('edits an existing job and replaces its skills', async () => {
  employerApi.listJobs.mockResolvedValue([job]);
  employerApi.updateJob.mockResolvedValue({ ...job, title: 'Senior Backend Engineer', required_skills: ['Go'] });
  renderWorkspace();

  await screen.findByText('Backend Engineer');
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  fireEvent.change(screen.getByLabelText('编辑岗位标题'), { target: { value: 'Senior Backend Engineer' } });
  fireEvent.change(screen.getByLabelText('编辑技能要求'), { target: { value: 'Go' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));

  await screen.findByText('已更新「Senior Backend Engineer」。');
  expect(employerApi.updateJob).toHaveBeenCalledWith(7, {
    title: 'Senior Backend Engineer',
    description: 'Build services.',
    required_skills: ['Go'],
  });
});

it('removes a job after the API confirms deletion', async () => {
  employerApi.listJobs.mockResolvedValue([job]);
  employerApi.deleteJob.mockResolvedValue({ deleted: true, id: 7 });
  renderWorkspace();

  await screen.findByText('Backend Engineer');
  fireEvent.click(screen.getByRole('button', { name: '删除' }));

  await screen.findByText('已删除「Backend Engineer」。');
  expect(employerApi.deleteJob).toHaveBeenCalledWith(7);
  expect(screen.queryByText('Backend Engineer')).toBeNull();
});

it('explains a 409 conflict instead of pretending the job was deleted', async () => {
  employerApi.listJobs.mockResolvedValue([job]);
  employerApi.deleteJob.mockRejectedValue(
    new ApiError('This job still has applications or interview slots.', { status: 409, code: 'job_has_dependents' }),
  );
  renderWorkspace();

  await screen.findByText('Backend Engineer');
  fireEvent.click(screen.getByRole('button', { name: '删除' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('该岗位仍有申请或面试时段，无法删除。');
  expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
});

it('sends the visitor back to login when the session expired', async () => {
  const onLoggedOut = vi.fn();
  employerApi.listJobs.mockRejectedValue(new ApiError('Not authenticated', { status: 401 }));
  renderWorkspace({ onLoggedOut });

  await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
});

it('escapes user-controlled job text instead of injecting markup', async () => {
  const hostile = '<script>alert(1)</script>';
  employerApi.listJobs.mockResolvedValue([{ ...job, title: hostile, description: 'Safe description.' }]);
  renderWorkspace();

  expect(await screen.findByText(hostile)).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
});

it('splitSkills trims, drops blanks and keeps the first spelling', () => {
  expect(splitSkills(' Python , python ,, SQL\nGo；Rust ')).toEqual(['Python', 'SQL', 'Go', 'Rust']);
  expect(splitSkills('   ')).toEqual([]);
});

const applicant = {
  id: 11,
  candidate_id: 5,
  display_name: 'Demo Candidate 1',
  skills: ['python', 'sql'],
  match_score: 100,
  status: 'Pending',
  booking: null,
  created_at: '2026-11-03T00:00:00Z',
  updated_at: '2026-11-03T00:00:00Z',
};

it('lists applicants with score, skills and status for an owned posting', async () => {
  employerApi.listJobs.mockResolvedValue([job]);
  employerApi.listApplicants.mockResolvedValue([applicant]);
  renderWorkspace();

  await screen.findByText('Backend Engineer');
  fireEvent.click(screen.getByRole('button', { name: '申请人' }));

  expect(await screen.findByText('Demo Candidate 1')).toBeInTheDocument();
  expect(screen.getByText('匹配分 100')).toBeInTheDocument();
  expect(screen.getByText('技能：python、sql')).toBeInTheDocument();
  expect(screen.getByText('申请人（1）')).toBeInTheDocument();
  expect(screen.getByLabelText('Demo Candidate 1 的申请状态')).toHaveValue('Pending');
  expect(employerApi.listApplicants).toHaveBeenCalledWith(7);
});

it('shows an empty state when nobody applied', async () => {
  employerApi.listJobs.mockResolvedValue([job]);
  employerApi.listApplicants.mockResolvedValue([]);
  renderWorkspace();

  await screen.findByText('Backend Engineer');
  fireEvent.click(screen.getByRole('button', { name: '申请人' }));

  expect(await screen.findByText('还没有人投递这个岗位。')).toBeInTheDocument();
});

it('changes an applicant status through the API and reflects the new value', async () => {
  employerApi.listJobs.mockResolvedValue([job]);
  employerApi.listApplicants.mockResolvedValue([applicant]);
  employerApi.updateApplicationStatus.mockResolvedValue({ ...applicant, status: 'Interviewing' });
  renderWorkspace();

  await screen.findByText('Backend Engineer');
  fireEvent.click(screen.getByRole('button', { name: '申请人' }));
  fireEvent.change(await screen.findByLabelText('Demo Candidate 1 的申请状态'), {
    target: { value: 'Interviewing' },
  });

  await waitFor(() => expect(employerApi.updateApplicationStatus).toHaveBeenCalledWith(11, 'Interviewing'));
  await waitFor(() =>
    expect(screen.getByLabelText('Demo Candidate 1 的申请状态')).toHaveValue('Interviewing'),
  );
  expect(screen.getByText('已将「Demo Candidate 1」设为面试中。')).toBeInTheDocument();
});

it('surfaces a failed applicant load without dropping the posting', async () => {
  employerApi.listJobs.mockResolvedValue([job]);
  employerApi.listApplicants.mockRejectedValue(new ApiError('面试时段服务不可用', { status: 500 }));
  renderWorkspace();

  await screen.findByText('Backend Engineer');
  fireEvent.click(screen.getByRole('button', { name: '申请人' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('面试时段服务不可用');
  expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
});

it('collapses the applicant panel when the toggle is pressed again', async () => {
  employerApi.listJobs.mockResolvedValue([job]);
  employerApi.listApplicants.mockResolvedValue([applicant]);
  renderWorkspace();

  await screen.findByText('Backend Engineer');
  fireEvent.click(screen.getByRole('button', { name: '申请人' }));
  await screen.findByText('Demo Candidate 1');
  fireEvent.click(screen.getByRole('button', { name: '收起申请人' }));

  await waitFor(() => expect(screen.queryByText('Demo Candidate 1')).toBeNull());
});

it('shows a booking time in Beijing time when an interview is arranged', async () => {
  employerApi.listJobs.mockResolvedValue([job]);
  employerApi.listApplicants.mockResolvedValue([
    { ...applicant, status: 'Interviewing', booking: { id: 3, slot_id: 9, start_at: '2026-11-08T01:00:00Z', end_at: '2026-11-08T01:30:00Z' } },
  ]);
  renderWorkspace();

  await screen.findByText('Backend Engineer');
  fireEvent.click(screen.getByRole('button', { name: '申请人' }));

  expect(await screen.findByText(/09:00（北京时间）/)).toBeInTheDocument();
});
