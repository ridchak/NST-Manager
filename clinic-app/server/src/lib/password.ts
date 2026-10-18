import { z } from 'zod';

export const MIN_PASSWORD_LENGTH = 10;

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(128);
