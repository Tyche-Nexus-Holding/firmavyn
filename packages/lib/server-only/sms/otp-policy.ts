export const SMS_OTP_EXPIRATION_MINUTES = 10;
export const SMS_OTP_MAX_ATTEMPTS = 5;
export const SMS_OTP_MAX_SENDS = 3;
export const SMS_OTP_RESEND_SECONDS = 60;

export type SmsOtpAttemptState = {
  attemptCount: number;
  expiresAt: Date;
};

export type SmsOtpAttemptResult = 'valid' | 'incorrect' | 'expired' | 'too-many-attempts';

export const evaluateSmsOtpAttempt = ({
  state,
  isCodeValid,
  now = new Date(),
}: {
  state: SmsOtpAttemptState;
  isCodeValid: boolean;
  now?: Date;
}): SmsOtpAttemptResult => {
  if (state.attemptCount >= SMS_OTP_MAX_ATTEMPTS) {
    return 'too-many-attempts';
  }

  if (state.expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }

  return isCodeValid ? 'valid' : 'incorrect';
};

export type SmsOtpSendState = {
  sendCount: number;
  lastSentAt: Date | null;
};

export type SmsOtpSendBlockReason = 'too-many-sends' | 'resend-too-soon' | null;

export const getSmsOtpSendBlockReason = ({
  state,
  now = new Date(),
}: {
  state: SmsOtpSendState;
  now?: Date;
}): SmsOtpSendBlockReason => {
  if (state.sendCount >= SMS_OTP_MAX_SENDS) {
    return 'too-many-sends';
  }

  if (state.lastSentAt && now.getTime() - state.lastSentAt.getTime() < SMS_OTP_RESEND_SECONDS * 1000) {
    return 'resend-too-soon';
  }

  return null;
};
