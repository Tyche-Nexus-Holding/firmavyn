import { prisma } from '@documenso/prisma';
import type { SmsVerificationOtp } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { DOCUMENT_AUDIT_LOG_TYPE } from '../../types/document-audit-logs';
import { DocumentAuth } from '../../types/document-auth';
import { maskPhoneNumber } from '../../universal/sms';
import { createDocumentAuditLogData } from '../../utils/document-audit-logs';
import { extractDocumentAuthMethods } from '../../utils/document-auth';
import { canUseFixedFakeSmsOtpCode, FAKE_SMS_OTP_CODE, isFakeSmsProvider } from './fake-sms-provider';
import { getSmsProvider } from './get-sms-provider';
import { createSmsOtpMessage, generateSmsOtpCode, hashSmsOtpCode } from './otp-code';
import { reserveSmsOtpSend, SMS_OTP_EXPIRATION_MINUTES, SMS_OTP_RESEND_SECONDS } from './otp-policy';
import type { SmsProvider, SmsSendResult } from './sms-provider';
import { getSmsUsagePeriod, getSmsVerificationPlan, isExtraSmsContract, SMS_EXTRA_PRICE_CENTS } from './sms-usage';

export type SendSmsVerificationOptions = {
  recipientToken: string;
  provider?: SmsProvider;
  now?: Date;
};

type SmsSendReservation = {
  recipientId: number;
  recipientEmail: string;
  recipientName: string;
  recipientPhone: string;
  envelopeId: string;
  teamId: number;
  previousOtp: SmsVerificationOtp | null;
};

export const sendSmsVerification = async ({
  recipientToken,
  provider = getSmsProvider(),
  now = new Date(),
}: SendSmsVerificationOptions) => {
  const code = isFakeSmsProvider(provider) && canUseFixedFakeSmsOtpCode() ? FAKE_SMS_OTP_CODE : generateSmsOtpCode();
  const { hash, salt } = hashSmsOtpCode(code);
  const expiresAt = new Date(now.getTime() + SMS_OTP_EXPIRATION_MINUTES * 60 * 1000);
  const period = getSmsUsagePeriod(now);

  const reservation = await reserveSmsVerificationSend({
    recipientToken,
    codeHash: hash,
    codeSalt: salt,
    expiresAt,
    now,
  });

  let sendResult: SmsSendResult;

  try {
    sendResult = await provider.send(reservation.recipientPhone, createSmsOtpMessage(code));
  } catch {
    await compensateSmsVerificationSend({ reservation, reservedCodeHash: hash, reservedAt: now });
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, { message: 'SMS provider failed' });
  }

  if (!sendResult.ok) {
    await compensateSmsVerificationSend({ reservation, reservedCodeHash: hash, reservedAt: now });
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, { message: sendResult.error || 'SMS provider failed' });
  }

  const result = await recordSmsVerificationSend({ reservation, period, now });

  return {
    success: true,
    expiresAt,
    retryAt: new Date(now.getTime() + SMS_OTP_RESEND_SECONDS * 1000),
    isExtra: result.isExtra,
  };
};

const reserveSmsVerificationSend = async ({
  recipientToken,
  codeHash,
  codeSalt,
  expiresAt,
  now,
}: {
  recipientToken: string;
  codeHash: string;
  codeSalt: string;
  expiresAt: Date;
  now: Date;
}): Promise<SmsSendReservation> => {
  return await prisma.$transaction(async (tx) => {
    const recipientReference = await tx.recipient.findFirst({
      where: { token: recipientToken },
      select: { id: true },
    });

    if (!recipientReference) {
      throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Recipient not found' });
    }

    await tx.$queryRaw`SELECT "id" FROM "Recipient" WHERE "id" = ${recipientReference.id} FOR UPDATE`;

    const recipient = await tx.recipient.findUnique({
      where: { id: recipientReference.id },
      include: {
        smsVerificationOtp: true,
        envelope: {
          include: {
            team: {
              include: {
                organisation: {
                  include: {
                    organisationClaim: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!recipient) {
      throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Recipient not found' });
    }

    const { derivedRecipientActionAuth } = extractDocumentAuthMethods({
      documentAuth: recipient.envelope.authOptions,
      recipientAuth: recipient.authOptions,
    });

    if (!derivedRecipientActionAuth.includes(DocumentAuth.SMS)) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, { message: 'SMS authentication is not required' });
    }

    if (
      getSmsVerificationPlan(recipient.envelope.team.organisation.organisationClaim.flags.smsVerification) === 'free'
    ) {
      throw new AppError(AppErrorCode.FORBIDDEN, { message: 'SMS verification is not available on the Free plan' });
    }

    if (!recipient.phone) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, { message: 'Recipient phone number is missing' });
    }

    const previousOtp = recipient.smsVerificationOtp;
    const sendReservation = reserveSmsOtpSend({
      state: {
        attemptCount: previousOtp?.attemptCount ?? 0,
        sendCount: previousOtp?.sendCount ?? 0,
        lastSentAt: previousOtp?.lastSentAt ?? null,
      },
      now,
    });

    if (!sendReservation.allowed && sendReservation.reason === 'too-many-sends') {
      throw new AppError(AppErrorCode.LIMIT_EXCEEDED, { message: 'SMS verification send limit exceeded' });
    }

    if (!sendReservation.allowed) {
      throw new AppError(AppErrorCode.TOO_MANY_REQUESTS, { message: 'SMS verification resend requested too soon' });
    }

    await tx.smsVerificationOtp.upsert({
      where: { recipientId: recipient.id },
      create: {
        recipientId: recipient.id,
        codeHash,
        codeSalt,
        expiresAt,
        attemptCount: sendReservation.state.attemptCount,
        sendCount: sendReservation.state.sendCount,
        lastSentAt: sendReservation.state.lastSentAt,
      },
      update: {
        codeHash,
        codeSalt,
        expiresAt,
        attemptCount: sendReservation.state.attemptCount,
        sendCount: sendReservation.state.sendCount,
        lastSentAt: sendReservation.state.lastSentAt,
        verifiedAt: null,
      },
    });

    return {
      recipientId: recipient.id,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      recipientPhone: recipient.phone,
      envelopeId: recipient.envelopeId,
      teamId: recipient.envelope.teamId,
      previousOtp,
    };
  });
};

const compensateSmsVerificationSend = async ({
  reservation,
  reservedCodeHash,
  reservedAt,
}: {
  reservation: SmsSendReservation;
  reservedCodeHash: string;
  reservedAt: Date;
}) => {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Recipient" WHERE "id" = ${reservation.recipientId} FOR UPDATE`;

    const currentOtp = await tx.smsVerificationOtp.findUnique({
      where: { recipientId: reservation.recipientId },
    });

    if (!currentOtp) {
      return;
    }

    const isCurrentReservation =
      currentOtp.codeHash === reservedCodeHash && currentOtp.lastSentAt?.getTime() === reservedAt.getTime();

    if (isCurrentReservation && !reservation.previousOtp) {
      await tx.smsVerificationOtp.delete({ where: { recipientId: reservation.recipientId } });
      return;
    }

    if (isCurrentReservation && reservation.previousOtp) {
      await tx.smsVerificationOtp.update({
        where: { recipientId: reservation.recipientId },
        data: {
          codeHash: reservation.previousOtp.codeHash,
          codeSalt: reservation.previousOtp.codeSalt,
          expiresAt: reservation.previousOtp.expiresAt,
          attemptCount: reservation.previousOtp.attemptCount,
          sendCount: reservation.previousOtp.sendCount,
          lastSentAt: reservation.previousOtp.lastSentAt,
          verifiedAt: reservation.previousOtp.verifiedAt,
        },
      });
      return;
    }

    if (currentOtp.sendCount > 0) {
      await tx.smsVerificationOtp.update({
        where: { recipientId: reservation.recipientId },
        data: { sendCount: { decrement: 1 } },
      });
    }
  });
};

const recordSmsVerificationSend = async ({
  reservation,
  period,
  now,
}: {
  reservation: SmsSendReservation;
  period: string;
  now: Date;
}) => {
  return await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Team" WHERE "id" = ${reservation.teamId} FOR UPDATE`;

    const existingContract = await tx.smsVerificationContractUsage.findUnique({
      where: {
        teamId_envelopeId_period: {
          teamId: reservation.teamId,
          envelopeId: reservation.envelopeId,
          period,
        },
      },
    });
    const monthlyUsage = await tx.smsVerificationMonthlyUsage.findUnique({
      where: { teamId_period: { teamId: reservation.teamId, period } },
    });
    const isExtra = existingContract?.isExtra ?? isExtraSmsContract(monthlyUsage?.contractCount ?? 0);

    if (!existingContract) {
      await tx.smsVerificationContractUsage.create({
        data: {
          teamId: reservation.teamId,
          envelopeId: reservation.envelopeId,
          period,
          isExtra,
        },
      });
    }

    await tx.smsVerificationMonthlyUsage.upsert({
      where: { teamId_period: { teamId: reservation.teamId, period } },
      create: {
        teamId: reservation.teamId,
        period,
        smsCount: 1,
        contractCount: existingContract ? 0 : 1,
        extraSmsCount: isExtra ? 1 : 0,
        extraAmountCents: isExtra ? SMS_EXTRA_PRICE_CENTS : 0,
      },
      update: {
        smsCount: { increment: 1 },
        contractCount: existingContract ? undefined : { increment: 1 },
        extraSmsCount: isExtra ? { increment: 1 } : undefined,
        extraAmountCents: isExtra ? { increment: SMS_EXTRA_PRICE_CENTS } : undefined,
      },
    });

    await tx.documentAuditLog.create({
      data: createDocumentAuditLogData({
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_ACTION_AUTH_SMS_SENT,
        envelopeId: reservation.envelopeId,
        data: {
          recipientEmail: reservation.recipientEmail,
          recipientName: reservation.recipientName,
          recipientId: reservation.recipientId,
          phoneNumber: maskPhoneNumber(reservation.recipientPhone),
          sentAt: now,
        },
      }),
    });

    return { isExtra };
  });
};
