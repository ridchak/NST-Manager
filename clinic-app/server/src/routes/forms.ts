import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

const FORM_TEMPLATES: Record<string, { title: string; fields: any[] }> = {
  'initial-intake': {
    title: 'Initial Intake Form',
    fields: [
      { id: 'chiefComplaint', label: 'Chief Complaint / Reason for Visit', type: 'textarea', required: true },
      { id: 'weightGoal', label: 'Weight Loss Goal (lbs)', type: 'number', required: true },
      { id: 'previousAttempts', label: 'Previous Weight Loss Attempts', type: 'textarea' },
      { id: 'currentMedications', label: 'Current Medications', type: 'textarea' },
      { id: 'allergies', label: 'Allergies', type: 'text' },
      { id: 'primaryCarePhysician', label: 'Primary Care Physician', type: 'text' },
      { id: 'referralSource', label: 'How did you hear about us?', type: 'select', options: ['Physician Referral', 'Insurance', 'Internet', 'Friend/Family', 'Advertisement', 'Other'] },
      { id: 'heightFeet', label: 'Height (feet)', type: 'number', required: true },
      { id: 'heightInches', label: 'Height (inches)', type: 'number', required: true },
      { id: 'currentWeight', label: 'Current Weight (lbs)', type: 'number', required: true },
    ],
  },
  'medical-history': {
    title: 'Medical History',
    fields: [
      { id: 'conditions', label: 'Medical Conditions', type: 'checkbox-group', options: ['Hypertension', 'Type 2 Diabetes', 'High Cholesterol', 'Sleep Apnea', 'Hypothyroidism', 'PCOS', 'Heart Disease', 'Arthritis', 'Depression/Anxiety', 'Other'] },
      { id: 'surgeries', label: 'Previous Surgeries', type: 'textarea' },
      { id: 'familyHistory', label: 'Family Medical History', type: 'textarea' },
      { id: 'smokingStatus', label: 'Smoking Status', type: 'select', options: ['Never', 'Former', 'Current'] },
      { id: 'alcoholUse', label: 'Alcohol Use', type: 'select', options: ['None', 'Occasional', 'Moderate', 'Heavy'] },
      { id: 'exerciseFrequency', label: 'Exercise Frequency', type: 'select', options: ['None', '1-2x/week', '3-4x/week', '5+x/week'] },
      { id: 'dietType', label: 'Current Diet', type: 'text' },
    ],
  },
  consent: {
    title: 'Treatment Consent',
    fields: [
      { id: 'treatmentConsent', label: 'I consent to treatment at LifeStart Weight Loss Clinic', type: 'checkbox', required: true },
      { id: 'riskAcknowledgment', label: 'I acknowledge the risks and benefits of the proposed treatment plan', type: 'checkbox', required: true },
      { id: 'financialResponsibility', label: 'I accept financial responsibility for services rendered', type: 'checkbox', required: true },
      { id: 'signature', label: 'Electronic Signature (Full Name)', type: 'text', required: true },
      { id: 'signatureDate', label: 'Date', type: 'date', required: true },
    ],
  },
  hipaa: {
    title: 'HIPAA Acknowledgment',
    fields: [
      { id: 'hipaaAcknowledgment', label: 'I acknowledge receipt of the Notice of Privacy Practices', type: 'checkbox', required: true },
      { id: 'authorizedPersons', label: 'Persons authorized to receive my health information', type: 'textarea' },
      { id: 'preferredContact', label: 'Preferred contact method', type: 'select', options: ['Phone', 'Email', 'Mail', 'Patient Portal'] },
      { id: 'signature', label: 'Electronic Signature (Full Name)', type: 'text', required: true },
      { id: 'signatureDate', label: 'Date', type: 'date', required: true },
    ],
  },
};

router.get('/templates', (_req: Request, res: Response) => {
  const templates = Object.entries(FORM_TEMPLATES).map(([id, t]) => ({ id, ...t }));
  res.json(templates);
});

router.get('/templates/:type', (req: Request, res: Response) => {
  const tmpl = FORM_TEMPLATES[req.params.type];
  if (!tmpl) return res.status(404).json({ error: 'Template not found' });
  res.json({ id: req.params.type, ...tmpl });
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const { patientId, status, formType, page = '1', limit = '20' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where: any = {};
    if (patientId) where.patientId = patientId;
    if (status) where.status = status;
    if (formType) where.formType = formType;
    const [forms, total] = await Promise.all([
      prisma.intakeForm.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: { patient: { select: { id: true, firstName: true, lastName: true, mrn: true } } },
      }),
      prisma.intakeForm.count({ where }),
    ]);
    res.json({ forms, total });
  } catch {
    res.status(500).json({ error: 'Failed to fetch forms' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const form = await prisma.intakeForm.findUnique({
      where: { id: req.params.id },
      include: { patient: { select: { id: true, firstName: true, lastName: true, mrn: true } } },
    });
    if (!form) return res.status(404).json({ error: 'Form not found' });
    res.json({ ...form, data: JSON.parse(form.data) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch form' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      patientId: z.string(),
      formType: z.enum(['initial-intake', 'medical-history', 'consent', 'hipaa']),
      data: z.record(z.any()).optional().default({}),
      status: z.enum(['pending', 'submitted', 'reviewed']).optional().default('submitted'),
    });
    const { patientId, formType, data, status } = schema.parse(req.body);
    const form = await prisma.intakeForm.create({
      data: {
        patientId,
        formType,
        data: JSON.stringify(data),
        status,
        submittedAt: status === 'submitted' ? new Date() : null,
      },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.status(201).json({ ...form, data });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create form' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      status: z.enum(['pending', 'submitted', 'reviewed']).optional(),
      data: z.record(z.any()).optional(),
    });
    const { status, data } = schema.parse(req.body);
    const form = await prisma.intakeForm.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(data && { data: JSON.stringify(data) }),
        ...(status === 'submitted' && { submittedAt: new Date() }),
      },
    });
    res.json(form);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Form not found' });
    res.status(500).json({ error: 'Failed to update form' });
  }
});

export default router;
