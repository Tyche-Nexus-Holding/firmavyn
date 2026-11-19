import { afterEach, describe, expect, it } from 'vitest';

import { canUseFixedFakeSmsOtpCode, SMS_PROVIDER_NOT_CONFIGURED_ERROR } from './fake-sms-provider';
import { getSmsProvider } from './get-sms-provider';

const originalNodeEnvironment = process.env.NODE_ENV;
const originalSmsProvider = process.env.SMS_PROVIDER;

afterEach(() => {
  if (originalNodeEnvironment === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnvironment;
  }

  if (originalSmsProvider === undefined) {
    delete process.env.SMS_PROVIDER;
  } else {
    process.env.SMS_PROVIDER = originalSmsProvider;
  }
});

describe('FakeSmsProvider production safety', () => {
  it('keeps the fixed-code fake available outside production', async () => {
    process.env.NODE_ENV = 'test';
    process.env.SMS_PROVIDER = 'fake';

    expect(canUseFixedFakeSmsOtpCode()).toBe(true);
    await expect(getSmsProvider().send('+34600123168', 'message')).resolves.toEqual({
      ok: true,
      cost: 0,
      currency: 'EUR',
    });
  });

  it.each([undefined, 'fake'])('rejects sends in production when SMS_PROVIDER is %s', async (smsProvider) => {
    process.env.NODE_ENV = 'production';

    if (smsProvider === undefined) {
      delete process.env.SMS_PROVIDER;
    } else {
      process.env.SMS_PROVIDER = smsProvider;
    }

    expect(canUseFixedFakeSmsOtpCode()).toBe(false);
    await expect(getSmsProvider().send('+34600123168', 'message')).resolves.toEqual({
      ok: false,
      error: SMS_PROVIDER_NOT_CONFIGURED_ERROR,
    });
  });
});
