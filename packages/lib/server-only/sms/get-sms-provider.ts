import { createFakeSmsProvider } from './fake-sms-provider';
import type { SmsProvider } from './sms-provider';
import { createZadarmaSmsProvider } from './zadarma-sms-provider';

export const getSmsProvider = (): SmsProvider => {
  const provider = process.env.SMS_PROVIDER || 'fake';

  if (provider === 'fake') {
    return createFakeSmsProvider();
  }

  if (provider !== 'zadarma') {
    throw new Error('Unsupported SMS_PROVIDER value');
  }

  const apiKey = process.env.ZADARMA_API_KEY;
  const apiSecret = process.env.ZADARMA_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('Zadarma SMS provider is missing its API credentials');
  }

  return createZadarmaSmsProvider({
    apiKey,
    apiSecret,
    sender: process.env.ZADARMA_SMS_SENDER || undefined,
  });
};
