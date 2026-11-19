import type { SmsProvider, SmsSendResult } from './sms-provider';

export const FAKE_SMS_OTP_CODE = '123456';
export const SMS_PROVIDER_NOT_CONFIGURED_ERROR = 'SMS provider no configurado';

export const canUseFixedFakeSmsOtpCode = (nodeEnvironment = process.env.NODE_ENV): boolean =>
  nodeEnvironment !== 'production';

export type FakeSmsProvider = SmsProvider & {
  readonly isFake: true;
};

export const createFakeSmsProvider = (): FakeSmsProvider => ({
  isFake: true,
  send: async (): Promise<SmsSendResult> =>
    canUseFixedFakeSmsOtpCode()
      ? { ok: true, cost: 0, currency: 'EUR' }
      : { ok: false, error: SMS_PROVIDER_NOT_CONFIGURED_ERROR },
});

export const isFakeSmsProvider = (provider: SmsProvider): provider is FakeSmsProvider => {
  return 'isFake' in provider && provider.isFake === true;
};
