import { describe, expect, it } from 'vitest';

import { ZSmsPhoneNumberSchema } from './sms';

describe('ZSmsPhoneNumberSchema', () => {
  it('accepts Spanish and international E.164 numbers', () => {
    expect(ZSmsPhoneNumberSchema.safeParse('+34600123168').success).toBe(true);
    expect(ZSmsPhoneNumberSchema.safeParse('+14155552671').success).toBe(true);
  });

  it('rejects malformed and non-E.164 numbers', () => {
    expect(ZSmsPhoneNumberSchema.safeParse('600123168').success).toBe(false);
    expect(ZSmsPhoneNumberSchema.safeParse('+34 600 123 168').success).toBe(false);
    expect(ZSmsPhoneNumberSchema.safeParse('+3460012316').success).toBe(false);
  });
});
