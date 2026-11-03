import { apiRequest } from './client';

export const applicationApi = {
  list: (signal) => apiRequest('/api/applications/', { signal }),
  apply: (job_id) => apiRequest('/api/applications/', { method: 'POST', body: { job_id } }),
};
