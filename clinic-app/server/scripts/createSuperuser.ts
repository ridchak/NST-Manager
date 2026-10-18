/**
 * Creates (or promotes) a superuser. Use this at go-live instead of the demo seed:
 *   npm run create-superuser -- you@clinic.com "Your Name"
 * The password is read from the SUPERUSER_PASSWORD environment variable so it never
 * appears in shell history or process listings.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { MIN_PASSWORD_LENGTH } from '../src/lib/password';

async function main() {
  const [emailArg, ...nameParts] = process.argv.slice(2);
  const password = process.env.SUPERUSER_PASSWORD;
  if (!emailArg || !emailArg.includes('@')) throw new Error('Usage: SUPERUSER_PASSWORD=... npm run create-superuser -- email@clinic.com "Full Name"');
  if (!password || password.length < MIN_PASSWORD_LENGTH) throw new Error(`Set SUPERUSER_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters).`);
  const email = emailArg.trim().toLowerCase();
  const name = nameParts.join(' ').trim() || 'Superuser';

  const prisma = new PrismaClient();
  try {
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name, password: hash, role: 'superuser' },
      update: { password: hash, role: 'superuser', active: true, failedLogins: 0, lockedUntil: null },
    });
    console.log(`Superuser ready: ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
