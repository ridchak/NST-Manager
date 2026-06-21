import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create staff users
  const adminPassword = await bcrypt.hash('admin123', 10);
  const providerPassword = await bcrypt.hash('provider123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@nstclinic.com' },
    update: {},
    create: {
      email: 'admin@nstclinic.com',
      password: adminPassword,
      name: 'Admin User',
      role: 'admin',
    },
  });

  const provider = await prisma.user.upsert({
    where: { email: 'dr.smith@nstclinic.com' },
    update: {},
    create: {
      email: 'dr.smith@nstclinic.com',
      password: providerPassword,
      name: 'Dr. Sarah Smith',
      role: 'provider',
    },
  });

  const provider2 = await prisma.user.upsert({
    where: { email: 'dr.jones@nstclinic.com' },
    update: {},
    create: {
      email: 'dr.jones@nstclinic.com',
      password: await bcrypt.hash('provider123', 10),
      name: 'Dr. Michael Jones',
      role: 'provider',
    },
  });

  console.log('Created users:', { admin: admin.email, provider: provider.email });

  // Create sample patients
  const patients = [
    {
      mrn: 'MRN-001',
      firstName: 'Jennifer',
      lastName: 'Martinez',
      dob: new Date('1985-03-15'),
      gender: 'female',
      email: 'jennifer.martinez@email.com',
      phone: '(555) 234-5678',
      address: '123 Oak Street',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      emergencyContactName: 'Carlos Martinez',
      emergencyContactPhone: '(555) 234-9999',
      notes: 'Patient referred by Dr. Thompson. Goal: lose 50 lbs in 12 months.',
      ecwId: 'ECW-001',
    },
    {
      mrn: 'MRN-002',
      firstName: 'Robert',
      lastName: 'Johnson',
      dob: new Date('1972-08-22'),
      gender: 'male',
      email: 'robert.johnson@email.com',
      phone: '(555) 345-6789',
      address: '456 Maple Avenue',
      city: 'Springfield',
      state: 'IL',
      zip: '62702',
      emergencyContactName: 'Linda Johnson',
      emergencyContactPhone: '(555) 345-0001',
      notes: 'Type 2 diabetic. Monitoring A1C closely. Goal: 40 lbs weight loss.',
      ecwId: 'ECW-002',
    },
    {
      mrn: 'MRN-003',
      firstName: 'Patricia',
      lastName: 'Williams',
      dob: new Date('1990-11-30'),
      gender: 'female',
      email: 'patricia.williams@email.com',
      phone: '(555) 456-7890',
      address: '789 Pine Road',
      city: 'Springfield',
      state: 'IL',
      zip: '62703',
      emergencyContactName: 'James Williams',
      emergencyContactPhone: '(555) 456-0002',
      notes: 'Post-partum weight loss program. No prior medical conditions.',
      ecwId: 'ECW-003',
    },
    {
      mrn: 'MRN-004',
      firstName: 'David',
      lastName: 'Brown',
      dob: new Date('1965-05-10'),
      gender: 'male',
      email: 'david.brown@email.com',
      phone: '(555) 567-8901',
      address: '321 Elm Street',
      city: 'Springfield',
      state: 'IL',
      zip: '62704',
      emergencyContactName: 'Mary Brown',
      emergencyContactPhone: '(555) 567-0003',
      notes: 'Hypertensive. On medication. Goal: 60 lbs loss and blood pressure control.',
      ecwId: 'ECW-004',
    },
    {
      mrn: 'MRN-005',
      firstName: 'Lisa',
      lastName: 'Davis',
      dob: new Date('1978-09-18'),
      gender: 'female',
      email: 'lisa.davis@email.com',
      phone: '(555) 678-9012',
      address: '654 Birch Lane',
      city: 'Springfield',
      state: 'IL',
      zip: '62705',
      emergencyContactName: 'Tom Davis',
      emergencyContactPhone: '(555) 678-0004',
      notes: 'Sleep apnea history. Using CPAP. Weight loss to improve sleep quality.',
      ecwId: 'ECW-005',
    },
  ];

  const createdPatients: Array<{ id: string; mrn: string }> = [];

  for (const patientData of patients) {
    const patient = await prisma.patient.upsert({
      where: { mrn: patientData.mrn },
      update: {},
      create: patientData,
    });
    createdPatients.push({ id: patient.id, mrn: patient.mrn });
    console.log(`Created patient: ${patient.firstName} ${patient.lastName}`);
  }

  // Create insurance info for patients
  const insuranceData = [
    { patientIdx: 0, insuranceName: 'Blue Cross Blue Shield', insuranceId: 'BCBS123456', groupNumber: 'GRP001', subscriberName: 'Jennifer Martinez', isPrimary: true },
    { patientIdx: 1, insuranceName: 'Aetna', insuranceId: 'AET789012', groupNumber: 'GRP002', subscriberName: 'Robert Johnson', isPrimary: true },
    { patientIdx: 2, insuranceName: 'United Healthcare', insuranceId: 'UHC345678', groupNumber: 'GRP003', subscriberName: 'Patricia Williams', isPrimary: true },
    { patientIdx: 3, insuranceName: 'Cigna', insuranceId: 'CGN901234', groupNumber: 'GRP004', subscriberName: 'David Brown', isPrimary: true },
    { patientIdx: 4, insuranceName: 'Humana', insuranceId: 'HUM567890', groupNumber: 'GRP005', subscriberName: 'Lisa Davis', isPrimary: true },
  ];

  const createdInsurance: Array<{ id: string; patientIdx: number }> = [];

  for (const ins of insuranceData) {
    const insurance = await prisma.insuranceInfo.create({
      data: {
        patientId: createdPatients[ins.patientIdx].id,
        insuranceName: ins.insuranceName,
        insuranceId: ins.insuranceId,
        groupNumber: ins.groupNumber,
        subscriberName: ins.subscriberName,
        isPrimary: ins.isPrimary,
      },
    });
    createdInsurance.push({ id: insurance.id, patientIdx: ins.patientIdx });
  }

  // Create insurance auths
  const authsData = [
    {
      patientIdx: 0,
      insuranceIdx: 0,
      authNumber: 'AUTH-2024-001',
      serviceType: 'Medical Weight Management',
      diagnosisCodes: JSON.stringify(['E66.01', 'Z68.41']),
      procedureCodes: JSON.stringify(['99213', 'S9470']),
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      status: 'approved',
      notes: 'Approved for 12 months of medical weight management.',
    },
    {
      patientIdx: 1,
      insuranceIdx: 1,
      authNumber: 'AUTH-2024-002',
      serviceType: 'Obesity Treatment with Comorbidity',
      diagnosisCodes: JSON.stringify(['E66.01', 'E11.9', 'Z68.43']),
      procedureCodes: JSON.stringify(['99214', 'S9470', '83036']),
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-12-31'),
      status: 'approved',
      notes: 'Approved for diabetes-related obesity treatment.',
    },
    {
      patientIdx: 2,
      insuranceIdx: 2,
      authNumber: null,
      serviceType: 'Behavioral Weight Loss Program',
      diagnosisCodes: JSON.stringify(['E66.09', 'Z68.38']),
      procedureCodes: JSON.stringify(['99213', 'S9470']),
      startDate: null,
      endDate: null,
      status: 'pending',
      notes: 'Authorization request submitted 2024-03-01. Awaiting response.',
    },
    {
      patientIdx: 3,
      insuranceIdx: 3,
      authNumber: 'AUTH-2024-004',
      serviceType: 'Intensive Behavioral Therapy',
      diagnosisCodes: JSON.stringify(['E66.01', 'I10', 'Z68.44']),
      procedureCodes: JSON.stringify(['99215', 'G0447']),
      startDate: new Date('2024-01-15'),
      endDate: new Date('2024-07-15'),
      status: 'expired',
      notes: 'Auth expired. Renewal in process.',
    },
    {
      patientIdx: 4,
      insuranceIdx: 4,
      authNumber: null,
      serviceType: 'Medical Weight Management',
      diagnosisCodes: JSON.stringify(['E66.01', 'G47.33']),
      procedureCodes: JSON.stringify(['99213', 'S9470']),
      startDate: null,
      endDate: null,
      status: 'denied',
      notes: 'Denied - not medically necessary per payer. Appeal submitted.',
    },
  ];

  const createdAuths: string[] = [];

  for (const auth of authsData) {
    const created = await prisma.insuranceAuth.create({
      data: {
        patientId: createdPatients[auth.patientIdx].id,
        insuranceId: createdInsurance[auth.insuranceIdx].id,
        authNumber: auth.authNumber ?? undefined,
        serviceType: auth.serviceType,
        diagnosisCodes: auth.diagnosisCodes,
        procedureCodes: auth.procedureCodes,
        startDate: auth.startDate ?? undefined,
        endDate: auth.endDate ?? undefined,
        status: auth.status,
        notes: auth.notes,
      },
    });
    createdAuths.push(created.id);
  }

  // Create appointments
  const today = new Date();
  const appointmentsData = [
    {
      patientIdx: 0,
      providerEmail: 'dr.smith@nstclinic.com',
      date: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0),
      duration: 60,
      type: 'initial-consult',
      status: 'confirmed',
      reason: 'Initial weight loss consultation',
    },
    {
      patientIdx: 1,
      providerEmail: 'dr.smith@nstclinic.com',
      date: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 30),
      duration: 30,
      type: 'follow-up',
      status: 'scheduled',
      reason: 'Monthly follow-up - diabetes management review',
    },
    {
      patientIdx: 2,
      providerEmail: 'dr.jones@nstclinic.com',
      date: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 11, 0),
      duration: 30,
      type: 'weigh-in',
      status: 'scheduled',
      reason: 'Weekly weigh-in',
    },
    {
      patientIdx: 3,
      providerEmail: 'dr.jones@nstclinic.com',
      date: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 0),
      duration: 45,
      type: 'follow-up',
      status: 'confirmed',
      reason: 'Blood pressure review and progress check',
    },
    {
      patientIdx: 4,
      providerEmail: 'dr.smith@nstclinic.com',
      date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 9, 30),
      duration: 60,
      type: 'initial-consult',
      status: 'scheduled',
      reason: 'New patient - sleep apnea and weight program',
    },
    {
      patientIdx: 0,
      providerEmail: 'dr.smith@nstclinic.com',
      date: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7, 9, 0),
      duration: 30,
      type: 'follow-up',
      status: 'completed',
      reason: 'Monthly follow-up',
      notes: 'Patient lost 4 lbs this month. On track. Increased exercise recommendation.',
    },
  ];

  for (const appt of appointmentsData) {
    const providerUser = appt.providerEmail === 'dr.smith@nstclinic.com' ? provider : provider2;
    await prisma.appointment.create({
      data: {
        patientId: createdPatients[appt.patientIdx].id,
        providerId: providerUser.id,
        date: appt.date,
        duration: appt.duration,
        type: appt.type,
        status: appt.status,
        reason: appt.reason,
        notes: appt.notes ?? null,
      },
    });
  }

  // Create progress entries
  const progressData = [
    // Jennifer Martinez - 6 months of progress
    { patientIdx: 0, date: new Date('2024-01-15'), weight: 248, bmi: 41.2, waist: 44, hips: 52, neck: 14.5, bloodPressure: '138/88', heartRate: 82, glucose: 105, a1c: 5.8 },
    { patientIdx: 0, date: new Date('2024-02-15'), weight: 242, bmi: 40.2, waist: 43, hips: 51, neck: 14.3, bloodPressure: '135/85', heartRate: 80, glucose: 102, a1c: null },
    { patientIdx: 0, date: new Date('2024-03-15'), weight: 235, bmi: 39.1, waist: 42, hips: 50, neck: 14.0, bloodPressure: '132/84', heartRate: 78, glucose: 99, a1c: 5.6 },
    { patientIdx: 0, date: new Date('2024-04-15'), weight: 229, bmi: 38.1, waist: 41, hips: 49, neck: 13.8, bloodPressure: '130/82', heartRate: 76, glucose: 97, a1c: null },
    { patientIdx: 0, date: new Date('2024-05-15'), weight: 222, bmi: 36.9, waist: 40, hips: 48, neck: 13.5, bloodPressure: '128/80', heartRate: 74, glucose: 95, a1c: 5.5 },
    { patientIdx: 0, date: new Date('2024-06-15'), weight: 216, bmi: 35.9, waist: 39, hips: 47, neck: 13.2, bloodPressure: '126/78', heartRate: 72, glucose: 93, a1c: null },
    // Robert Johnson - 4 months of progress
    { patientIdx: 1, date: new Date('2024-02-01'), weight: 285, bmi: 43.5, waist: 48, hips: 54, neck: 16.5, bloodPressure: '145/92', heartRate: 88, glucose: 180, a1c: 8.2 },
    { patientIdx: 1, date: new Date('2024-03-01'), weight: 277, bmi: 42.3, waist: 47, hips: 53, neck: 16.2, bloodPressure: '142/90', heartRate: 86, glucose: 165, a1c: null },
    { patientIdx: 1, date: new Date('2024-04-01'), weight: 268, bmi: 40.9, waist: 46, hips: 52, neck: 15.8, bloodPressure: '138/88', heartRate: 84, glucose: 148, a1c: 7.8 },
    { patientIdx: 1, date: new Date('2024-05-01'), weight: 259, bmi: 39.6, waist: 45, hips: 51, neck: 15.5, bloodPressure: '135/86', heartRate: 82, glucose: 135, a1c: null },
    // Patricia Williams - 2 months
    { patientIdx: 2, date: new Date('2024-03-10'), weight: 195, bmi: 32.4, waist: 38, hips: 46, neck: 13.5, bloodPressure: '118/75', heartRate: 72, glucose: 88, a1c: 5.2 },
    { patientIdx: 2, date: new Date('2024-04-10'), weight: 189, bmi: 31.4, waist: 37, hips: 45, neck: 13.2, bloodPressure: '116/74', heartRate: 70, glucose: 86, a1c: null },
    // David Brown - 3 months
    { patientIdx: 3, date: new Date('2024-01-20'), weight: 310, bmi: 45.1, waist: 52, hips: 56, neck: 18.0, bloodPressure: '155/98', heartRate: 92, glucose: 110, a1c: 6.1 },
    { patientIdx: 3, date: new Date('2024-02-20'), weight: 298, bmi: 43.4, waist: 51, hips: 55, neck: 17.5, bloodPressure: '148/94', heartRate: 90, glucose: 107, a1c: null },
    { patientIdx: 3, date: new Date('2024-03-20'), weight: 287, bmi: 41.8, waist: 50, hips: 54, neck: 17.0, bloodPressure: '142/90', heartRate: 88, glucose: 105, a1c: 6.0 },
    // Lisa Davis - 1 entry
    { patientIdx: 4, date: new Date('2024-04-05'), weight: 220, bmi: 36.6, waist: 42, hips: 50, neck: 15.0, bloodPressure: '128/82', heartRate: 78, glucose: 96, a1c: 5.7 },
  ];

  for (const entry of progressData) {
    await prisma.progressEntry.create({
      data: {
        patientId: createdPatients[entry.patientIdx].id,
        date: entry.date,
        weight: entry.weight,
        bmi: entry.bmi,
        waist: entry.waist,
        hips: entry.hips,
        neck: entry.neck,
        bloodPressure: entry.bloodPressure,
        heartRate: entry.heartRate,
        glucose: entry.glucose,
        a1c: entry.a1c ?? null,
      },
    });
  }

  // Create intake forms
  const formsData = [
    {
      patientIdx: 0,
      formType: 'initial-intake',
      status: 'reviewed',
      submittedAt: new Date('2024-01-10'),
      data: JSON.stringify({
        chiefComplaint: 'Significant weight gain over past 3 years',
        currentMedications: ['Metformin 500mg', 'Lisinopril 10mg'],
        allergies: ['Penicillin'],
        familyHistory: ['Diabetes', 'Hypertension'],
        previousWeightLossAttempts: 'Multiple diet programs, gym membership',
        activityLevel: 'sedentary',
        smokingStatus: 'never',
        alcoholUse: 'occasional',
      }),
    },
    {
      patientIdx: 0,
      formType: 'hipaa',
      status: 'reviewed',
      submittedAt: new Date('2024-01-10'),
      data: JSON.stringify({ acknowledged: true, signedDate: '2024-01-10' }),
    },
    {
      patientIdx: 1,
      formType: 'initial-intake',
      status: 'reviewed',
      submittedAt: new Date('2024-01-25'),
      data: JSON.stringify({
        chiefComplaint: 'Type 2 diabetes management and weight loss',
        currentMedications: ['Metformin 1000mg', 'Jardiance 10mg', 'Atorvastatin 40mg'],
        allergies: ['Sulfa'],
        familyHistory: ['Diabetes', 'Heart Disease'],
        previousWeightLossAttempts: 'Keto diet, Jenny Craig',
        activityLevel: 'lightly-active',
        smokingStatus: 'former',
        alcoholUse: 'none',
      }),
    },
    {
      patientIdx: 2,
      formType: 'initial-intake',
      status: 'submitted',
      submittedAt: new Date('2024-03-05'),
      data: JSON.stringify({
        chiefComplaint: 'Post-partum weight loss, 40 lbs gained during pregnancy',
        currentMedications: ['Prenatal vitamins'],
        allergies: [],
        familyHistory: ['Obesity'],
        previousWeightLossAttempts: 'Intermittent fasting',
        activityLevel: 'moderately-active',
        smokingStatus: 'never',
        alcoholUse: 'none',
      }),
    },
    {
      patientIdx: 3,
      formType: 'initial-intake',
      status: 'pending',
      submittedAt: null,
      data: JSON.stringify({}),
    },
  ];

  for (const form of formsData) {
    await prisma.intakeForm.create({
      data: {
        patientId: createdPatients[form.patientIdx].id,
        formType: form.formType,
        status: form.status,
        submittedAt: form.submittedAt,
        data: form.data,
      },
    });
  }

  console.log('Database seeded successfully!');
  console.log('\nLogin credentials:');
  console.log('  Admin:    admin@nstclinic.com / admin123');
  console.log('  Provider: dr.smith@nstclinic.com / provider123');
  console.log('  Provider: dr.jones@nstclinic.com / provider123');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
