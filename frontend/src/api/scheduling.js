import { apiRequest } from './client';

export const availabilityApi = {
  jobs: (signal) => apiRequest('/api/slots/jobs/', { signal }),
  list: (signal) => apiRequest('/api/slots/', { signal }),
  create: (body) => apiRequest('/api/slots/', { method: 'POST', body }),
  remove: (id) => apiRequest(`/api/slots/${id}/`, { method: 'DELETE' }),
};
