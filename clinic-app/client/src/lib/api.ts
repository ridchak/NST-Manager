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
    // A wrong password on the sign-in form is also a 401; let that page show its own message.
    if (err.response?.status === 401 && !String(err.config?.url ?? '').includes('/auth/login')) {
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
  logout: () => api.post('/auth/logout').then(r => r.data),
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

export interface AuditFilters { from?: string; to?: string; actorId?: string; patientId?: string; action?: string; outcome?: string }

export const auditApi = {
  list: (params: AuditFilters & { page?: number; limit?: number }) => api.get('/audit', { params }).then(r => r.data),
  actions: () => api.get('/audit/actions').then(r => r.data),
  verify: () => api.get('/audit/verify').then(r => r.data),
  /** Downloads the filtered log as a CSV file. */
  async exportCsv(params: AuditFilters) {
    const res = await api.get('/audit/export', { params, responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export const usersApi = {
  list: () => api.get('/users').then(r => r.data),
  create: (data: { email: string; name: string; password: string; role: string; isProvider: boolean }) => api.post('/users', data).then(r => r.data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/users/${id}`, data).then(r => r.data),
  unlock: (id: string) => api.post(`/users/${id}/unlock`).then(r => r.data),
  resetPassword: (id: string, newPassword: string) => api.post(`/users/${id}/reset-password`, { newPassword }).then(r => r.data),
  remove: (id: string) => api.delete(`/users/${id}`).then(r => r.data),
};

/** Best human-readable message from a failed request. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' ? data.error : fallback;
}

export interface PracticeDetails {
  name: string; street: string; suite: string | null; city: string; state: string; zip: string;
  phone: string; fax: string | null; timezone: string; hours: string;
  phoneDisplay: string; faxDisplay: string | null; addressLine: string;
  hoursByDay: Record<string, [string, string] | null>; hoursText: string;
  extFrontDesk: string | null; extScheduling: string | null; extMedications: string | null; extBilling: string | null;
  notificationEmail: string | null;
  isDefault: boolean; overriddenByEnvironment: boolean;
}

export const practiceApi = {
  get: (): Promise<PracticeDetails> => api.get('/practice').then(r => r.data),
  save: (data: Record<string, unknown>): Promise<PracticeDetails> => api.put('/practice', data).then(r => r.data),
};

export const messagesApi = {
  list: (params?: { status?: string; type?: string }) => api.get('/messages', { params }).then(r => r.data),
  calls: () => api.get('/messages/calls').then(r => r.data),
  setStatus: (id: string, status: 'open' | 'done') => api.patch(`/messages/${id}`, { status }).then(r => r.data),
};

export default api;
