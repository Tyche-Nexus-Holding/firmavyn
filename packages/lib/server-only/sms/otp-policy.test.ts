import { describe, expect, it } from 'vitest';

import { hashSmsOtpCode, verifySmsOtpCodeHash } from './otp-code';
import { evaluateSmsOtpAttempt, getSmsOtpSendBlockReason } from './otp-policy';

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
      getSmsOtpSendBlockReason({ state: { sendCount: 1, lastSentAt: new Date('2026-11-18T09:59:01.000Z') }, now }),
    ).toBe('resend-too-soon');
  });
});
