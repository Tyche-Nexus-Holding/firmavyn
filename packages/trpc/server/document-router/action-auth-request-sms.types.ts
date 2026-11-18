import { z } from 'zod';

export const ZActionAuthRequestSmsRequestSchema = z.object({
  token: z.string().min(1),
});

export const ZActionAuthRequestSmsResponseSchema = z.object({
  success: z.boolean(),
  expiresAt: z.date(),
  retryAt: z.date(),
  isExtra: z.boolean(),
});

export type TActionAuthRequestSmsRequest = z.infer<typeof ZActionAuthRequestSmsRequestSchema>;
export type TActionAuthRequestSmsResponse = z.infer<typeof ZActionAuthRequestSmsResponseSchema>;
