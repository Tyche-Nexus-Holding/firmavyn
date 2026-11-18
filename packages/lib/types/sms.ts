import { msg } from '@lingui/core/macro';
import { z } from 'zod';

export const ZSmsPhoneNumberSchema = z
  .string()
  .trim()
  .regex(/^(?:\+34\d{9}|\+(?!34)[1-9]\d{7,14})$/, {
    message: msg`Use an international phone number in E.164 format`.id,
  });

export const ZSmsPhoneNumberInputSchema = z.union([ZSmsPhoneNumberSchema, z.literal('')]);

export const ZSmsPhoneNumberNullableSchema = z.preprocess(
  (value) => (value === '' ? null : value),
  ZSmsPhoneNumberSchema.nullable(),
);

export type TSmsPhoneNumber = z.infer<typeof ZSmsPhoneNumberSchema>;
