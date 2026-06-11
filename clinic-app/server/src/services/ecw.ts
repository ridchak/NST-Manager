import axios from 'axios';

interface ECWPatient {
  patientId: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
}

interface ECWAppointment {
  appointmentId: string;
  patientId: string;
  date: string;
  provider: string;
  type: string;
  status: string;
}

export class ECWService {
  private baseURL: string;
  private username: string;
  private password: string;

  constructor() {
    this.baseURL = process.env.ECW_BASE_URL || '';
    this.username = process.env.ECW_USERNAME || '';
    this.password = process.env.ECW_PASSWORD || '';
  }

  private isConfigured(): boolean {
    return !!(this.baseURL && this.username && this.password);
  }

  private get authHeader() {
    return { Authorization: 'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64') };
  }

  async searchPatient(query: { lastName?: string; dob?: string; mrn?: string }): Promise<ECWPatient[]> {
    if (!this.isConfigured()) return this.mockPatients();
    try {
      const res = await axios.get(`${this.baseURL}/api/patients/search`, {
        headers: this.authHeader,
        params: query,
      });
      return res.data.patients || [];
    } catch {
      return [];
    }
  }

  async syncPatient(ecwId: string): Promise<ECWPatient | null> {
    if (!this.isConfigured()) return null;
    try {
      const res = await axios.get(`${this.baseURL}/api/patients/${ecwId}`, {
        headers: this.authHeader,
      });
      return res.data;
    } catch {
      return null;
    }
  }

  async getAppointments(patientId?: string): Promise<ECWAppointment[]> {
    if (!this.isConfigured()) return this.mockAppointments();
    try {
      const res = await axios.get(`${this.baseURL}/api/appointments`, {
        headers: this.authHeader,
        params: patientId ? { patientId } : {},
      });
      return res.data.appointments || [];
    } catch {
      return [];
    }
  }

  async syncAppointment(appt: { patientEcwId: string; date: string; type: string; duration: number }): Promise<string | null> {
    if (!this.isConfigured()) return null;
    try {
      const res = await axios.post(`${this.baseURL}/api/appointments`, appt, {
        headers: { ...this.authHeader, 'Content-Type': 'application/json' },
      });
      return res.data.appointmentId;
    } catch {
      return null;
    }
  }

  getStatus(): { configured: boolean; baseURL: string } {
    return { configured: this.isConfigured(), baseURL: this.baseURL || 'Not configured' };
  }

  private mockPatients(): ECWPatient[] {
    return [
      { patientId: 'ecw001', firstName: 'Maria', lastName: 'Johnson', dob: '1975-03-15', gender: 'F', phone: '555-123-4567', email: 'maria.johnson@email.com' },
    ];
  }

  private mockAppointments(): ECWAppointment[] {
    return [
      { appointmentId: 'a001', patientId: 'ecw001', date: new Date().toISOString(), provider: 'Dr. Smith', type: 'Follow-up', status: 'Scheduled' },
    ];
  }
}

export const ecwService = new ECWService();
