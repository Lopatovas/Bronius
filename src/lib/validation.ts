import { z } from 'zod';

export const e164Schema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be in E.164 format (e.g. +14155552671)');

export const startCallSchema = z.object({
  toNumber: e164Schema,
});

export type StartCallInput = z.infer<typeof startCallSchema>;
