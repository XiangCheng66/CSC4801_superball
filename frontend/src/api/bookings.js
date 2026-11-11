import { apiRequest } from './client';
export const bookingApi = {
  applications: (signal) => apiRequest('/api/booking-applications/', { signal }),
  slots: (id, signal) => apiRequest(`/api/booking-applications/${id}/slots/`, { signal }),
  list: (signal) => apiRequest('/api/bookings/', { signal }),
  create: (application_id, slot_id) => apiRequest('/api/bookings/', { method: 'POST', body: { application_id, slot_id } }),
};
