import { describe, expect, it } from 'vitest';

import { hashSmsOtpCode, verifySmsOtpCodeHash } from './otp-code';
import { evaluateSmsOtpAttempt, reserveSmsOtpSend } from './otp-policy';

const now = new Date('2026-11-18T10:00:00.000Z');

describe('SMS OTP policy', () => {
  it('accepts a correct unexpired code', () => {
    const { hash, salt } = hashSmsOtpCode('123456', 'fixed-test-salt');

    expect(
      evaluateSmsOtpAttempt({
        state: { attemptCount: 0, expiresAt: new Date('2026-11-18T10:10:00.000Z') },
        isCodeValid: verifySmsOtpCodeHash({ code: '123456', hash, salt }),
        now,
      }),
    ).toBe('valid');
  });

  it('rejects an incorrect code', () => {
    const { hash, salt } = hashSmsOtpCode('123456', 'fixed-test-salt');

    expect(
      evaluateSmsOtpAttempt({
        state: { attemptCount: 0, expiresAt: new Date('2026-11-18T10:10:00.000Z') },
        isCodeValid: verifySmsOtpCodeHash({ code: '654321', hash, salt }),
        now,
      }),
    ).toBe('incorrect');
  });

  it('rejects an expired code', () => {
    expect(
      evaluateSmsOtpAttempt({
        state: { attemptCount: 0, expiresAt: new Date('2026-11-18T09:59:59.000Z') },
        isCodeValid: true,
        now,
      }),
    ).toBe('expired');
  });

  it('rejects attempts after the fifth failure', () => {
    expect(
      evaluateSmsOtpAttempt({
        state: { attemptCount: 5, expiresAt: new Date('2026-11-18T10:10:00.000Z') },
        isCodeValid: true,
        now,
      }),
    ).toBe('too-many-attempts');
  });

  it('blocks resending before 60 seconds', () => {
    expect(
      reserveSmsOtpSend({
        state: { attemptCount: 0, sendCount: 1, lastSentAt: new Date('2026-11-18T09:59:01.000Z') },
        now,
      }),
    ).toEqual({ allowed: false, reason: 'resend-too-soon' });
  });

  it('does not reserve more than three sends', () => {
    expect(
      reserveSmsOtpSend({
        state: { attemptCount: 0, sendCount: 3, lastSentAt: new Date('2026-11-18T09:58:00.000Z') },
        now,
      }),
    ).toEqual({ allowed: false, reason: 'too-many-sends' });
  });

  it('resets the attempt count when reserving a new code', () => {
    expect(
      reserveSmsOtpSend({
        state: { attemptCount: 4, sendCount: 1, lastSentAt: new Date('2026-11-18T09:58:59.000Z') },
        now,
      }),
    ).toEqual({
      allowed: true,
      state: { attemptCount: 0, sendCount: 2, lastSentAt: now },
    });
  });
});
