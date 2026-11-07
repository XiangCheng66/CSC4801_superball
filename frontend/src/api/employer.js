import { apiRequest } from './client';

export const employerApi = {
  getCompany: (signal) => apiRequest('/api/employer/company/', { signal }),
  saveCompany: (body) => apiRequest('/api/employer/company/', { method: 'PUT', body }),
  listJobs: (signal) => apiRequest('/api/employer/jobs/', { signal }),
  createJob: (body) => apiRequest('/api/employer/jobs/', { method: 'POST', body }),
  updateJob: (id, body) => apiRequest(`/api/employer/jobs/${id}/`, { method: 'PATCH', body }),
  deleteJob: (id) => apiRequest(`/api/employer/jobs/${id}/`, { method: 'DELETE' }),
  listApplicants: (jobId, signal) => apiRequest(`/api/employer/jobs/${jobId}/applicants/`, { signal }),
  updateApplicationStatus: (applicationId, status) =>
    apiRequest(`/api/employer/applications/${applicationId}/status/`, { method: 'PATCH', body: { status } }),
};
