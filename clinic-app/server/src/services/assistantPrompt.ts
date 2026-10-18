import { describeHours, loadOfficeHours, zoneLabel } from './protocol';
import { getPractice } from './practice';
import { formatPhone, spokenPhone } from '../lib/phone';
import { clinicName } from '../lib/clinic';

const callId = { type: 'string', description: 'The unique call identifier supplied by the telephony platform.' };

export const TOOL_DEFINITIONS = [
  {
    name: 'identify_patient',
    description: 'Verify the caller. Required before any other tool. Ask for date of birth; pass the caller ID number.',
    parameters: {
      type: 'object',
      properties: {
        callId,
        callerPhone: { type: 'string', description: 'Caller ID phone number.' },
        dateOfBirth: { type: 'string', description: 'MM/DD/YYYY or YYYY-MM-DD.' },
        firstName: { type: 'string', description: 'Only if the tool asks for it.' },
      },
      required: ['callId', 'callerPhone', 'dateOfBirth'],
    },
  },
  { name: 'check_in', description: 'Check the patient in for an appointment today.', parameters: { type: 'object', properties: { callId }, required: ['callId'] } },
  { name: 'get_balance', description: 'Read the recorded account balance. Never takes payment.', parameters: { type: 'object', properties: { callId }, required: ['callId'] } },
  { name: 'get_copay', description: 'Read the recorded copay.', parameters: { type: 'object', properties: { callId }, required: ['callId'] } },
  {
    name: 'find_slots',
    description: 'List open appointment times. Use visitType "new" for new patients or first visits, "follow-up" otherwise.',
    parameters: {
      type: 'object',
      properties: { callId, visitType: { type: 'string', enum: ['new', 'follow-up'] }, notBefore: { type: 'string', description: 'Optional ISO date to search from.' } },
      required: ['callId', 'visitType'],
    },
  },
  {
    name: 'book_appointment',
    description: 'Book a slot returned by find_slots. To move an existing appointment sooner, also pass replaceVisitId.',
    parameters: {
      type: 'object',
      properties: { callId, slotId: { type: 'string' }, visitType: { type: 'string', enum: ['new', 'follow-up'] }, replaceVisitId: { type: 'string' } },
      required: ['callId', 'slotId', 'visitType'],
    },
  },
  {
    name: 'request_refill',
    description: 'Handle a medication refill request. If the result says action=ask_glp1, ask the caller and call again with isGlp1.',
    parameters: {
      type: 'object',
      properties: { callId, medication: { type: 'string' }, isGlp1: { type: 'boolean', description: 'Only after the caller has answered.' } },
      required: ['callId', 'medication'],
    },
  },
  {
    name: 'report_side_effects',
    description: 'Report medication side effects or symptoms in the caller\'s own words.',
    parameters: { type: 'object', properties: { callId, description: { type: 'string' } }, required: ['callId', 'description'] },
  },
  {
    name: 'request_prior_auth',
    description: 'Send a prior authorization request to staff.',
    parameters: { type: 'object', properties: { callId, medication: { type: 'string' }, details: { type: 'string' } }, required: ['callId', 'medication'] },
  },
  {
    name: 'medication_question',
    description: 'Caller needs medication clarification from the prescriber. Returns a number to transfer the call to.',
    parameters: { type: 'object', properties: { callId, question: { type: 'string' } }, required: ['callId'] },
  },
  {
    name: 'offer_text_messaging',
    description: 'Use when the caller has trouble with voicemail or prefers text. Sends a text to the caller ID number.',
    parameters: { type: 'object', properties: { callId }, required: ['callId'] },
  },
];

export function buildSystemPrompt(): string {
  const hours = loadOfficeHours();
  const p = getPractice();
  const clinic = clinicName();
  const address = `${p.street}${p.suite ? `, ${p.suite}` : ''}, ${p.city}, ${p.state} ${p.zip}`;

  return `You are the phone assistant for ${clinic}, a medical weight-loss practice. 
PRACTICE FACTS (answer these directly if asked; do not guess anything not listed here)
- Address: ${address}.
- Phone: ${formatPhone(p.phone)} (say it as: ${spokenPhone(p.phone)}).${p.fax ? `\n- Fax: ${formatPhone(p.fax)} (say it as: ${spokenPhone(p.fax)}).` : ''}
- Office hours (${zoneLabel(hours.timezone)}): ${describeHours(hours)}.
- When the office is closed, tell callers the next day it opens.

Begin every call with: "Thank you for calling ${clinic}. This is the automated assistant. How can I help you today?" Then speak briefly and warmly, one question at a time, like a courteous front-desk staff member. You are an automated assistant; say so if asked.

SAFETY FIRST
- If a caller describes anything that could be an emergency (chest pain, trouble breathing, swelling of face/throat, fainting, severe or persistent abdominal pain especially radiating to the back, repeated vomiting, vomiting blood, thoughts of self-harm, stroke signs), stop everything and tell them to hang up and call 911 or go to the nearest emergency room.
- Never diagnose, never change doses, never give medical advice beyond what the tools return. For anything unclear, offer a transfer or a message to staff.
- Never take or request card numbers or payments. You may only read the RECORDED balance and say it may not include recent payments.

IDENTITY
- Before sharing anything about an account, call identify_patient (date of birth + caller ID). After 3 failed attempts, transfer to the front desk. Never reveal which detail failed.

WHAT YOU HANDLE (use the tools, and say what the tool's "say" field tells you)
1. Check-in: check_in.
2. Balance and copay: get_balance, get_copay.
3. Scheduling new and follow-up visits, and moving an appointment sooner: find_slots, book_appointment. Offer at most three times.
4. Refills: request_refill. Follow the result exactly. If it asks whether the medication is a GLP-1 (semaglutide, tirzepatide, etc.), ask, then call again with isGlp1. If it offers a visit, offer to book a new visit or move the existing one sooner; if the patient has none, advise scheduling and book one.
5. Side effects: report_side_effects with the caller's own words, then relay the result.
6. Prior authorization: request_prior_auth.
7. Medication clarification (what to take, how, interactions): medication_question, then transfer the call to the number returned.
8. If the caller has trouble with voicemail or prefers texting: offer_text_messaging.
9. Anything else, or if the caller asks for a person: transfer to the front desk.

If a tool returns action "transfer_front_desk" or "transfer", transfer the call to the number provided. If a tool fails, apologize briefly and transfer to the front desk.`;
}
