import type { SmsProvider, SmsSendResult } from './sms-provider';

export const FAKE_SMS_OTP_CODE = '123456';

export type FakeSmsProvider = SmsProvider & {
  readonly isFake: true;
};

export const createFakeSmsProvider = (): FakeSmsProvider => ({
  isFake: true,
  send: async (): Promise<SmsSendResult> => ({ ok: true, cost: 0, currency: 'EUR' }),
});

export const isFakeSmsProvider = (provider: SmsProvider): provider is FakeSmsProvider => {
  return 'isFake' in provider && provider.isFake === true;
};
