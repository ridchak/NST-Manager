import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }).then(r => r.data),
  getMe: () => api.get('/auth/me').then(r => r.data),
  changePassword: (current: string, next: string) => api.post('/auth/change-password', { currentPassword: current, newPassword: next }).then(r => r.data),
};

export const patientsApi = {
  list: (params?: { search?: string; page?: number; limit?: number; status?: string }) => api.get('/patients', { params }).then(r => r.data),
  get: (id: string) => api.get(`/patients/${id}`).then(r => r.data),
  getStats: (id: string) => api.get(`/patients/${id}/stats`).then(r => r.data),
  create: (data: any) => api.post('/patients', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/patients/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/patients/${id}`).then(r => r.data),
};

export const appointmentsApi = {
  list: (params?: any) => api.get('/appointments', { params }).then(r => r.data),
  get: (id: string) => api.get(`/appointments/${id}`).then(r => r.data),
  getToday: () => api.get('/appointments/today').then(r => r.data),
  create: (data: any) => api.post('/appointments', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/appointments/${id}`, data).then(r => r.data),
  cancel: (id: string) => api.delete(`/appointments/${id}`).then(r => r.data),
};

export const progressApi = {
  list: (params?: any) => api.get('/progress', { params }).then(r => r.data),
  getChart: (patientId: string) => api.get(`/progress/chart/${patientId}`).then(r => r.data),
  create: (data: any) => api.post('/progress', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/progress/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/progress/${id}`).then(r => r.data),
};

export const formsApi = {
  list: (params?: any) => api.get('/forms', { params }).then(r => r.data),
  get: (id: string) => api.get(`/forms/${id}`).then(r => r.data),
  getTemplates: () => api.get('/forms/templates').then(r => r.data),
  getTemplate: (type: string) => api.get(`/forms/templates/${type}`).then(r => r.data),
  create: (data: any) => api.post('/forms', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/forms/${id}`, data).then(r => r.data),
};

export const insuranceApi = {
  list: (params?: any) => api.get('/insurance', { params }).then(r => r.data),
  get: (id: string) => api.get(`/insurance/${id}`).then(r => r.data),
  getStats: () => api.get('/insurance/stats').then(r => r.data),
  create: (data: any) => api.post('/insurance', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/insurance/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/insurance/${id}`).then(r => r.data),
};

export const phoneApi = {
  getConfig: () => api.get('/phone/config').then(r => r.data),
  getCalls: (limit?: number) => api.get('/phone/calls', { params: { limit } }).then(r => r.data),
  makeCall: (toNumber: string) => api.post('/phone/call', { toNumber }).then(r => r.data),
  getMessages: (limit?: number) => api.get('/phone/messages', { params: { limit } }).then(r => r.data),
  sendMessage: (toNumber: string, text: string) => api.post('/phone/message', { toNumber, text }).then(r => r.data),
  getVoicemails: () => api.get('/phone/voicemails').then(r => r.data),
};

export default api;
