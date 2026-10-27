import { apiRequest } from './client';

export const candidateApi = {
  profile: (signal) => apiRequest('/api/candidate/profile/', { signal }),
  saveProfile: (body) => apiRequest('/api/candidate/profile/', { method: 'PUT', body }),
  resume: (signal) => apiRequest('/api/candidate/resume/', { signal }),
  saveResume: (resume_text) => apiRequest('/api/candidate/resume/', { method: 'PUT', body: { resume_text } }),
  recommendations: (signal) => apiRequest('/api/candidate/recommendations/', { signal }),
};
