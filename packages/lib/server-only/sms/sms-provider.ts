export type SmsSendResult = {
  ok: boolean;
  cost?: number;
  currency?: string;
  error?: string;
};

export type SmsProvider = {
  send: (to: string, text: string) => Promise<SmsSendResult>;
};
