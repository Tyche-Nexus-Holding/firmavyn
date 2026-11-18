import { prisma } from '@documenso/prisma';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { DOCUMENT_AUDIT_LOG_TYPE } from '../../types/document-audit-logs';
import { DocumentAuth } from '../../types/document-auth';
import { maskPhoneNumber } from '../../universal/sms';
import { createDocumentAuditLogData } from '../../utils/document-audit-logs';
import { extractDocumentAuthMethods } from '../../utils/document-auth';
import { FAKE_SMS_OTP_CODE, isFakeSmsProvider } from './fake-sms-provider';
import { getSmsProvider } from './get-sms-provider';
import { createSmsOtpMessage, generateSmsOtpCode, hashSmsOtpCode } from './otp-code';
import { getSmsOtpSendBlockReason, SMS_OTP_EXPIRATION_MINUTES, SMS_OTP_RESEND_SECONDS } from './otp-policy';
import type { SmsProvider } from './sms-provider';
import { getSmsUsagePeriod, getSmsVerificationPlan, isExtraSmsContract, SMS_EXTRA_PRICE_CENTS } from './sms-usage';

export type SendSmsVerificationOptions = {
  recipientToken: string;
  provider?: SmsProvider;
  now?: Date;
};

export const sendSmsVerification = async ({
  recipientToken,
  provider = getSmsProvider(),
  now = new Date(),
}: SendSmsVerificationOptions) => {
  const code = isFakeSmsProvider(provider) ? FAKE_SMS_OTP_CODE : generateSmsOtpCode();
  const { hash, salt } = hashSmsOtpCode(code);
  const expiresAt = new Date(now.getTime() + SMS_OTP_EXPIRATION_MINUTES * 60 * 1000);
  const period = getSmsUsagePeriod(now);

  const result = await prisma.$transaction(async (tx) => {
    const recipient = await tx.recipient.findFirst({
      where: { token: recipientToken },
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

    await tx.$queryRaw`SELECT "id" FROM "Recipient" WHERE "id" = ${recipient.id} FOR UPDATE`;

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

    const latestOtp = await tx.smsVerificationOtp.findUnique({ where: { recipientId: recipient.id } });
    const blockReason = getSmsOtpSendBlockReason({
      state: {
        sendCount: latestOtp?.sendCount ?? 0,
        lastSentAt: latestOtp?.lastSentAt ?? null,
      },
      now,
    });

    if (blockReason === 'too-many-sends') {
      throw new AppError(AppErrorCode.LIMIT_EXCEEDED, { message: 'SMS verification send limit exceeded' });
    }

    if (blockReason === 'resend-too-soon') {
      throw new AppError(AppErrorCode.TOO_MANY_REQUESTS, { message: 'SMS verification resend requested too soon' });
    }

    const sendResult = await provider.send(recipient.phone, createSmsOtpMessage(code));

    if (!sendResult.ok) {
      throw new AppError(AppErrorCode.UNKNOWN_ERROR, { message: sendResult.error || 'SMS provider failed' });
    }

    await tx.smsVerificationOtp.upsert({
      where: { recipientId: recipient.id },
      create: {
        recipientId: recipient.id,
        codeHash: hash,
        codeSalt: salt,
        expiresAt,
        sendCount: 1,
        lastSentAt: now,
      },
      update: {
        codeHash: hash,
        codeSalt: salt,
        expiresAt,
        sendCount: { increment: 1 },
        lastSentAt: now,
        verifiedAt: null,
      },
    });

    await tx.$queryRaw`SELECT "id" FROM "Team" WHERE "id" = ${recipient.envelope.teamId} FOR UPDATE`;

    const existingContract = await tx.smsVerificationContractUsage.findUnique({
      where: {
        teamId_envelopeId_period: {
          teamId: recipient.envelope.teamId,
          envelopeId: recipient.envelopeId,
          period,
        },
      },
    });
    const monthlyUsage = await tx.smsVerificationMonthlyUsage.findUnique({
      where: { teamId_period: { teamId: recipient.envelope.teamId, period } },
    });
    const isExtra = existingContract?.isExtra ?? isExtraSmsContract(monthlyUsage?.contractCount ?? 0);

    if (!existingContract) {
      await tx.smsVerificationContractUsage.create({
        data: {
          teamId: recipient.envelope.teamId,
          envelopeId: recipient.envelopeId,
          period,
          isExtra,
        },
      });
    }

    await tx.smsVerificationMonthlyUsage.upsert({
      where: { teamId_period: { teamId: recipient.envelope.teamId, period } },
      create: {
        teamId: recipient.envelope.teamId,
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
        envelopeId: recipient.envelopeId,
        data: {
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          recipientId: recipient.id,
          phoneNumber: maskPhoneNumber(recipient.phone),
          sentAt: now,
        },
      }),
    });

    return { isExtra };
  });

  return {
    success: true,
    expiresAt,
    retryAt: new Date(now.getTime() + SMS_OTP_RESEND_SECONDS * 1000),
    isExtra: result.isExtra,
  };
};
