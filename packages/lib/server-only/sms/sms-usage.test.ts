import { describe, expect, it } from 'vitest';
import { assertRecipientActionAuthAllowed } from './assert-recipient-action-auth-allowed';
import { getSmsUsagePeriod, getSmsVerificationPlan, isExtraSmsContract } from './sms-usage';

describe('SMS verification usage', () => {
  it('keeps SMS disabled on the free plan', () => {
    expect(getSmsVerificationPlan(false)).toBe('free');
    expect(getSmsVerificationPlan(undefined)).toBe('free');
    expect(() => assertRecipientActionAuthAllowed({ actionAuth: [['SMS']], flags: {} })).toThrow(
      'SMS verification is available on the Basic plan',
    );
  });

  it('includes five contracts and marks the sixth as extra', () => {
    expect(getSmsVerificationPlan(true)).toBe('basic');
    expect([0, 1, 2, 3, 4].map(isExtraSmsContract)).toEqual([false, false, false, false, false]);
    expect(isExtraSmsContract(5)).toBe(true);
  });

  it('uses a new counter period when the UTC month changes', () => {
    expect(getSmsUsagePeriod(new Date('2026-11-30T23:59:59.999Z'))).toBe('2026-11');
    expect(getSmsUsagePeriod(new Date('2026-12-01T00:00:00.000Z'))).toBe('2026-12');
  });
});
