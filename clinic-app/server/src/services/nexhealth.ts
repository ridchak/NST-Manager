import axios, { AxiosInstance } from 'axios';

/**
 * Thin client for the NexHealth Synchronizer API.
 *
 * NOTE: endpoint paths and field names below follow NexHealth's public Synchronizer
 * documentation as best known, but they have NOT been exercised against a live
 * NexHealth account. Verify each call in the NexHealth sandbox before go-live;
 * response parsing is deliberately defensive so mismatches fail loudly, not silently.
 */

export interface NexConfig {
  apiKey: string;
  subdomain: string;
  locationId: string;
  baseUrl: string;
  providerIds: string[];
  appointmentTypeNew?: string;
  appointmentTypeFollowUp?: string;
}

export function nexConfigFromEnv(): NexConfig | null {
  const { NEXHEALTH_API_KEY, NEXHEALTH_SUBDOMAIN, NEXHEALTH_LOCATION_ID } = process.env;
  if (!NEXHEALTH_API_KEY || !NEXHEALTH_SUBDOMAIN || !NEXHEALTH_LOCATION_ID) return null;
  return {
    apiKey: NEXHEALTH_API_KEY,
    subdomain: NEXHEALTH_SUBDOMAIN,
    locationId: NEXHEALTH_LOCATION_ID,
    baseUrl: process.env.NEXHEALTH_BASE_URL || 'https://nexhealth.info',
    providerIds: (process.env.NEXHEALTH_PROVIDER_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
    appointmentTypeNew: process.env.NEXHEALTH_APPT_TYPE_NEW,
    appointmentTypeFollowUp: process.env.NEXHEALTH_APPT_TYPE_FOLLOWUP,
  };
}

export interface NexPatient {
  id: number;
  first_name: string;
  last_name: string;
  bio?: {
    date_of_birth?: string;
    phone_number?: string;
    cell_phone_number?: string;
    home_phone_number?: string;
  };
  balance?: { amount?: string | number; currency?: string } | null;
  updated_at?: string;
}

export interface NexAppointment {
  id: number;
  patient_id: number;
  provider_id: number;
  start_time: string;
  end_time?: string;
  cancelled?: boolean;
  provider_name?: string;
}

export interface NexSlotGroup {
  lid: number;
  pid: number;
  operatory_id?: number;
  slots: Array<{ time: string; end_time?: string; operatory_id?: number }>;
}

export class NexHealthClient {
  private http: AxiosInstance;
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private cfg: NexConfig) {
    this.http = axios.create({
      baseURL: cfg.baseUrl,
      timeout: 15000,
      headers: { Accept: 'application/vnd.Nexhealth+json;version=2' },
    });
  }

  get config(): NexConfig {
    return this.cfg;
  }

  private async bearer(): Promise<string> {
    // Tokens last about an hour; refresh a few minutes early.
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    const res = await this.http.post('/authenticates', null, { headers: { Authorization: this.cfg.apiKey } });
    const token = res.data?.data?.token;
    if (!token) throw new Error('NexHealth authentication returned no token');
    this.token = token;
    this.tokenExpiresAt = Date.now() + 50 * 60 * 1000;
    return token;
  }

  private async request<T>(method: 'get' | 'post' | 'patch', path: string, opts: { params?: any; data?: any } = {}): Promise<T> {
    const token = await this.bearer();
    try {
      const res = await this.http.request({
        method,
        url: path,
        params: { subdomain: this.cfg.subdomain, location_id: this.cfg.locationId, ...opts.params },
        data: opts.data,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data && res.data.code === false) throw new Error(`NexHealth error: ${JSON.stringify(res.data.error ?? res.data)}`);
      return res.data?.data as T;
    } catch (err: any) {
      if (err.response?.status === 401) this.token = null; // force re-auth next call
      throw err;
    }
  }

  async searchPatientsByPhone(phone: string): Promise<NexPatient[]> {
    const rows = await this.request<NexPatient[]>('get', '/patients', { params: { phone_number: phone, per_page: 50 } });
    return Array.isArray(rows) ? rows : [];
  }

  async getPatient(id: string): Promise<NexPatient> {
    return this.request<NexPatient>('get', `/patients/${id}`);
  }

  async listAppointments(patientId: string, start: Date, end: Date): Promise<NexAppointment[]> {
    const rows = await this.request<NexAppointment[]>('get', '/appointments', {
      params: { patient_id: patientId, start: start.toISOString(), end: end.toISOString(), per_page: 100 },
    });
    return Array.isArray(rows) ? rows : [];
  }

  async appointmentSlots(opts: { startDate: string; days: number; providerIds: string[]; appointmentTypeId?: string }): Promise<NexSlotGroup[]> {
    const rows = await this.request<NexSlotGroup[]>('get', '/appointment_slots', {
      params: {
        start_date: opts.startDate,
        days: opts.days,
        'lids[]': [this.cfg.locationId],
        'pids[]': opts.providerIds,
        ...(opts.appointmentTypeId ? { appointment_type_id: opts.appointmentTypeId } : {}),
      },
    });
    return Array.isArray(rows) ? rows : [];
  }

  async bookAppointment(body: { patientId: string; providerId: string; startTime: string; operatoryId?: string; appointmentTypeId?: string; note?: string }): Promise<NexAppointment> {
    return this.request<NexAppointment>('post', '/appointments', {
      data: {
        appt: {
          patient_id: Number(body.patientId),
          provider_id: Number(body.providerId),
          start_time: body.startTime,
          ...(body.operatoryId ? { operatory_id: Number(body.operatoryId) } : {}),
          ...(body.appointmentTypeId ? { appointment_type_id: Number(body.appointmentTypeId) } : {}),
          ...(body.note ? { note: body.note } : {}),
        },
      },
    });
  }

  async cancelAppointment(id: string): Promise<void> {
    await this.request('patch', `/appointments/${id}`, { data: { appt: { cancelled: true } } });
  }
}
