import nodemailer from 'nodemailer';
import prisma from '../lib/prisma';

export type MessageType = 'refill' | 'side-effect' | 'prior-auth' | 'check-in' | 'med-question' | 'callback' | 'general';

export interface StaffMessageInput {
  type: MessageType;
  subject: string;
  body: string;
  priority?: 'normal' | 'urgent';
  patientId?: string | null;
  callId?: string;
}

function mailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
}

/**
 * Stores a message for the staff inbox and, when SMTP + STAFF_EMAIL are configured,
 * sends a short email. The email intentionally carries NO clinical detail: ordinary
 * email is not a secure channel for PHI, so staff open the app to read the request.
 */
export async function sendStaffMessage(input: StaffMessageInput) {
  const msg = await prisma.staffMessage.create({
    data: {
      type: input.type,
      subject: input.subject,
      body: input.body,
      priority: input.priority ?? 'normal',
      patientId: input.patientId ?? null,
      callId: input.callId,
    },
  });

  const to = process.env.STAFF_EMAIL;
  const transport = mailer();
  if (to && transport) {
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER || 'assistant@localhost',
        to,
        subject: `${msg.priority === 'urgent' ? '[URGENT] ' : ''}New ${input.type} request from phone assistant`,
        text: 'A new request is waiting in the clinic app under Messages. Please log in to review it.',
      });
    } catch (err) {
      console.error('Staff email failed (message is still saved in the app):', (err as Error).message);
    }
  }
  return msg;
}
