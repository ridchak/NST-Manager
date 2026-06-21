import axios from 'axios';

interface RCCall {
  id: string;
  from: { phoneNumber: string; name?: string };
  to: { phoneNumber: string; name?: string };
  direction: 'Inbound' | 'Outbound';
  duration: number;
  startTime: string;
  result: string;
  recordingUrl?: string;
}

interface RCMessage {
  id: string;
  from: { phoneNumber: string; name?: string };
  to: Array<{ phoneNumber: string; name?: string }>;
  subject: string;
  readStatus: string;
  creationTime: string;
  messageStatus: string;
}

export class RingCentralService {
  private baseURL: string;
  private token: string | null = null;

  constructor() {
    this.baseURL = process.env.RC_SERVER_URL || 'https://platform.ringcentral.com';
  }

  private isConfigured(): boolean {
    return !!(process.env.RC_CLIENT_ID && process.env.RC_CLIENT_SECRET && process.env.RC_USERNAME);
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const params = new URLSearchParams({
      grant_type: 'password',
      username: process.env.RC_USERNAME!,
      password: process.env.RC_PASSWORD!,
      extension: process.env.RC_EXTENSION || '',
      client_id: process.env.RC_CLIENT_ID!,
      client_secret: process.env.RC_CLIENT_SECRET!,
    });
    const res = await axios.post(`${this.baseURL}/restapi/oauth/token`, params);
    this.token = res.data.access_token;
    return this.token!;
  }

  async getCalls(limit = 20): Promise<RCCall[]> {
    if (!this.isConfigured()) return this.mockCalls();
    try {
      const token = await this.getToken();
      const res = await axios.get(`${this.baseURL}/restapi/v1.0/account/~/extension/~/call-log`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { perPage: limit, view: 'Detailed' },
      });
      return res.data.records;
    } catch {
      return this.mockCalls();
    }
  }

  async makeCall(toNumber: string, fromNumber?: string): Promise<any> {
    if (!this.isConfigured()) return { success: false, error: 'RingCentral not configured' };
    const token = await this.getToken();
    const res = await axios.post(
      `${this.baseURL}/restapi/v1.0/account/~/extension/~/ring-out`,
      { from: { phoneNumber: fromNumber || process.env.RC_EXTENSION }, to: { phoneNumber: toNumber }, playPrompt: false },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  }

  async getMessages(limit = 20): Promise<RCMessage[]> {
    if (!this.isConfigured()) return this.mockMessages();
    try {
      const token = await this.getToken();
      const res = await axios.get(`${this.baseURL}/restapi/v1.0/account/~/extension/~/message-store`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { perPage: limit, messageType: 'SMS' },
      });
      return res.data.records;
    } catch {
      return this.mockMessages();
    }
  }

  async sendMessage(toNumber: string, text: string): Promise<any> {
    if (!this.isConfigured()) return { success: false, error: 'RingCentral not configured' };
    const token = await this.getToken();
    const res = await axios.post(
      `${this.baseURL}/restapi/v1.0/account/~/extension/~/sms`,
      { from: { phoneNumber: process.env.RC_EXTENSION }, to: [{ phoneNumber: toNumber }], text },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  }

  async getVoicemails(limit = 10): Promise<RCMessage[]> {
    if (!this.isConfigured()) return this.mockVoicemails();
    try {
      const token = await this.getToken();
      const res = await axios.get(`${this.baseURL}/restapi/v1.0/account/~/extension/~/message-store`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { perPage: limit, messageType: 'VoiceMail' },
      });
      return res.data.records;
    } catch {
      return this.mockVoicemails();
    }
  }

  private mockCalls(): RCCall[] {
    return [
      { id: '1', from: { phoneNumber: '+15551234567', name: 'Maria Johnson' }, to: { phoneNumber: '+18005551234' }, direction: 'Inbound', duration: 185, startTime: new Date(Date.now() - 3600000).toISOString(), result: 'Call connected' },
      { id: '2', from: { phoneNumber: '+18005551234' }, to: { phoneNumber: '+15559876543', name: 'David Chen' }, direction: 'Outbound', duration: 92, startTime: new Date(Date.now() - 7200000).toISOString(), result: 'Call connected' },
      { id: '3', from: { phoneNumber: '+15552223333', name: 'Sarah Williams' }, to: { phoneNumber: '+18005551234' }, direction: 'Inbound', duration: 0, startTime: new Date(Date.now() - 14400000).toISOString(), result: 'Voicemail' },
      { id: '4', from: { phoneNumber: '+15554445555', name: 'Robert Garcia' }, to: { phoneNumber: '+18005551234' }, direction: 'Inbound', duration: 312, startTime: new Date(Date.now() - 86400000).toISOString(), result: 'Call connected' },
    ];
  }

  private mockMessages(): RCMessage[] {
    return [
      { id: 'm1', from: { phoneNumber: '+15551234567', name: 'Maria Johnson' }, to: [{ phoneNumber: '+18005551234' }], subject: 'Appointment reminder - see you tomorrow!', readStatus: 'Read', creationTime: new Date(Date.now() - 1800000).toISOString(), messageStatus: 'Received' },
      { id: 'm2', from: { phoneNumber: '+18005551234' }, to: [{ phoneNumber: '+15559876543' }], subject: 'Hi David, your appointment is confirmed for 2pm Friday.', readStatus: 'Read', creationTime: new Date(Date.now() - 3600000).toISOString(), messageStatus: 'Sent' },
      { id: 'm3', from: { phoneNumber: '+15552223333', name: 'Sarah Williams' }, to: [{ phoneNumber: '+18005551234' }], subject: 'Can I reschedule my appointment?', readStatus: 'Unread', creationTime: new Date(Date.now() - 7200000).toISOString(), messageStatus: 'Received' },
    ];
  }

  private mockVoicemails(): RCMessage[] {
    return [
      { id: 'v1', from: { phoneNumber: '+15556667777', name: 'Insurance Co.' }, to: [{ phoneNumber: '+18005551234' }], subject: 'Voicemail regarding auth #A12345', readStatus: 'Unread', creationTime: new Date(Date.now() - 5400000).toISOString(), messageStatus: 'Received' },
    ];
  }
}

export const ringCentralService = new RingCentralService();
