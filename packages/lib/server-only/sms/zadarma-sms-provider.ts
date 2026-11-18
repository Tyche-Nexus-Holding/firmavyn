import { createHash, createHmac } from 'node:crypto';

import type { SmsProvider, SmsSendResult } from './sms-provider';

const ZADARMA_SMS_ENDPOINT = 'https://api.zadarma.com/v1/sms/send/';
const ZADARMA_SMS_METHOD = '/v1/sms/send/';

type ZadarmaSmsProviderOptions = {
  apiKey: string;
  apiSecret: string;
  sender?: string;
  fetchImplementation?: typeof fetch;
};

type ZadarmaSmsResponse = {
  status?: string;
  message?: string;
  cost?: number;
  currency?: string;
  denied_numbers?: Array<{
    number?: string;
    message?: string;
  }>;
};

export const buildZadarmaQuery = (parameters: Record<string, string>): string => {
  const sortedParameters = Object.entries(parameters).sort(([firstKey], [secondKey]) =>
    firstKey.localeCompare(secondKey),
  );

  return new URLSearchParams(sortedParameters).toString();
};

export const createZadarmaSignature = ({
  method,
  query,
  apiSecret,
}: {
  method: string;
  query: string;
  apiSecret: string;
}): string => {
  const queryMd5 = createHash('md5').update(query).digest('hex');
  const hmacHex = createHmac('sha1', apiSecret).update(`${method}${query}${queryMd5}`).digest('hex');

  // Zadarma's official PHP SDK base64-encodes the hexadecimal HMAC string, not the raw digest bytes.
  return Buffer.from(hmacHex, 'utf8').toString('base64');
};

export const createZadarmaSmsProvider = ({
  apiKey,
  apiSecret,
  sender,
  fetchImplementation = fetch,
}: ZadarmaSmsProviderOptions): SmsProvider => ({
  send: async (to, text): Promise<SmsSendResult> => {
    const parameters: Record<string, string> = {
      number: to.replace(/^\+/, ''),
      message: text,
    };

    if (sender) {
      parameters.sender = sender;
    }

    const query = buildZadarmaQuery(parameters);
    const signature = createZadarmaSignature({ method: ZADARMA_SMS_METHOD, query, apiSecret });

    let response: Response;

    try {
      response = await fetchImplementation(ZADARMA_SMS_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `${apiKey}:${signature}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: query,
      });
    } catch {
      return { ok: false, error: 'SMS provider unavailable' };
    }

    if (!response.ok) {
      return { ok: false, error: 'SMS provider request failed' };
    }

    const data = (await response.json().catch(() => null)) as ZadarmaSmsResponse | null;

    if (!data || data.status !== 'success') {
      return { ok: false, error: 'SMS provider rejected the request' };
    }

    if (data.denied_numbers && data.denied_numbers.length > 0) {
      return { ok: false, error: 'SMS provider denied the destination number' };
    }

    return {
      ok: true,
      cost: data.cost,
      currency: data.currency,
    };
  },
});
