import { apiRequest } from './client';

export const authApi = {
  me: (signal) => apiRequest('/api/auth/me/', { signal }),
  register: (body) => apiRequest('/api/auth/register/', { method: 'POST', body }),
  login: (body) => apiRequest('/api/auth/login/', { method: 'POST', body }),
  logout: () => apiRequest('/api/auth/logout/', { method: 'POST' }),
  workspace: (role) => apiRequest(`/api/${role === 'Candidate' ? 'candidate' : 'employer'}/session/`),
};
