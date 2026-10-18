/** US phone-number helpers. Numbers are stored as digits / E.164 and shown formatted. */

/** 10 digits, or null if the input is not a valid US number. Accepts "+1 (630) 445-1022", "630.445.1022", etc. */
export function digits10(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? ten : null; // area code and exchange cannot start with 0 or 1
}

/** "+16304451022" for dialing and for telephony platforms. */
export function toE164(raw: string | null | undefined): string | null {
  const d = digits10(raw);
  return d ? `+1${d}` : null;
}

/** "(630) 445-1022"; returns the input unchanged if it is not a 10-digit number. */
export function formatPhone(raw: string | null | undefined): string {
  const d = digits10(raw);
  return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw ?? '';
}

/** Phone number read aloud digit by digit, "six three zero, four four five, one zero two two". */
export function spokenPhone(raw: string | null | undefined): string {
  const d = digits10(raw);
  if (!d) return raw ?? '';
  const w = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const say = (s: string) => s.split('').map(c => w[Number(c)]).join(' ');
  return `${say(d.slice(0, 3))}, ${say(d.slice(3, 6))}, ${say(d.slice(6))}`;
}
