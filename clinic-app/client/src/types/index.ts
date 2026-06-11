export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'provider' | 'staff';
  createdAt: string;
}

export interface Patient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
  ecwId?: string;
  createdAt: string;
  updatedAt: string;
  appointments?: Appointment[];
  progressEntries?: ProgressEntry[];
  intakeForms?: IntakeForm[];
  insuranceInfos?: InsuranceInfo[];
  insuranceAuths?: InsuranceAuth[];
  _count?: { appointments: number; progressEntries: number };
}

export interface Appointment {
  id: string;
  patientId: string;
  providerId: string;
  date: string;
  duration: number;
  type: 'initial-consult' | 'follow-up' | 'weigh-in' | 'nutrition' | 'procedure' | 'telehealth';
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  reason?: string;
  notes?: string;
  ecwId?: string;
  createdAt: string;
  patient?: Pick<Patient, 'id' | 'firstName' | 'lastName' | 'mrn' | 'phone'>;
  provider?: Pick<User, 'id' | 'name'>;
}

export interface ProgressEntry {
  id: string;
  patientId: string;
  date: string;
  weight?: number;
  bmi?: number;
  waist?: number;
  hips?: number;
  neck?: number;
  bloodPressure?: string;
  heartRate?: number;
  glucose?: number;
  a1c?: number;
  notes?: string;
  createdAt: string;
  patient?: Pick<Patient, 'id' | 'firstName' | 'lastName' | 'mrn'>;
}

export interface IntakeForm {
  id: string;
  patientId: string;
  formType: 'initial-intake' | 'medical-history' | 'consent' | 'hipaa';
  status: 'pending' | 'submitted' | 'reviewed';
  submittedAt?: string;
  data: Record<string, any>;
  createdAt: string;
  patient?: Pick<Patient, 'id' | 'firstName' | 'lastName' | 'mrn'>;
}

export interface InsuranceInfo {
  id: string;
  patientId: string;
  insuranceName: string;
  insuranceId: string;
  groupNumber?: string;
  subscriberName?: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface InsuranceAuth {
  id: string;
  patientId: string;
  insuranceId: string;
  authNumber?: string;
  serviceType: string;
  diagnosisCodes: string[];
  procedureCodes: string[];
  requestDate: string;
  startDate?: string;
  endDate?: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  notes?: string;
  createdAt: string;
  updatedAt: string;
  patient?: Pick<Patient, 'id' | 'firstName' | 'lastName' | 'mrn'>;
  insurance?: InsuranceInfo;
}

export interface CallRecord {
  id: string;
  from: { phoneNumber: string; name?: string };
  to: { phoneNumber: string; name?: string };
  direction: 'Inbound' | 'Outbound';
  duration: number;
  startTime: string;
  result: string;
  recordingUrl?: string;
}

export interface RCMessage {
  id: string;
  from: { phoneNumber: string; name?: string };
  to: Array<{ phoneNumber: string; name?: string }>;
  subject: string;
  readStatus: string;
  creationTime: string;
  messageStatus: string;
}

export interface PatientStats {
  totalWeightLost: number;
  appointmentCount: number;
  progressEntryCount: number;
  currentWeight: number | null;
  startWeight: number | null;
  currentBMI: number | null;
}

export interface FormTemplate {
  id: string;
  title: string;
  fields: Array<{
    id: string;
    label: string;
    type: string;
    required?: boolean;
    options?: string[];
  }>;
}

export interface AuthStats {
  pending: number;
  approved: number;
  denied: number;
  expired: number;
  expiringSoon: number;
}
