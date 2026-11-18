import { prisma } from '@documenso/prisma';

import { DOCUMENT_AUDIT_LOG_TYPE } from '../../types/document-audit-logs';
import { maskPhoneNumber } from '../../universal/sms';
import { createDocumentAuditLogData } from '../../utils/document-audit-logs';
import { verifySmsOtpCodeHash } from './otp-code';
import { evaluateSmsOtpAttempt } from './otp-policy';

export type VerifySmsVerificationOptions = {
  recipientId: number;
  code: string;
  now?: Date;
};

export const verifySmsVerification = async ({
  recipientId,
  code,
  now = new Date(),
}: VerifySmsVerificationOptions): Promise<boolean> => {
  return await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Recipient" WHERE "id" = ${recipientId} FOR UPDATE`;

    const recipient = await tx.recipient.findUnique({
      where: { id: recipientId },
      include: { smsVerificationOtp: true },
    });

    if (!recipient?.phone || !recipient.smsVerificationOtp) {
      return false;
    }

    const otp = recipient.smsVerificationOtp;
    const isCodeValid = verifySmsOtpCodeHash({ code, hash: otp.codeHash, salt: otp.codeSalt });
    const result = evaluateSmsOtpAttempt({ state: otp, isCodeValid, now });
    const auditBase = {
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      recipientId: recipient.id,
      phoneNumber: maskPhoneNumber(recipient.phone),
    };

    if (result === 'valid') {
      await tx.smsVerificationOtp.update({
        where: { recipientId },
        data: { verifiedAt: now },
      });
      await tx.documentAuditLog.create({
        data: createDocumentAuditLogData({
          type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_ACTION_AUTH_SMS_VERIFIED,
          envelopeId: recipient.envelopeId,
          data: { ...auditBase, verifiedAt: now },
        }),
      });

      return true;
    }

    if (result === 'incorrect') {
      await tx.smsVerificationOtp.update({
        where: { recipientId },
        data: { attemptCount: { increment: 1 } },
      });
    }

    await tx.documentAuditLog.create({
      data: createDocumentAuditLogData({
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_ACTION_AUTH_SMS_FAILED,
        envelopeId: recipient.envelopeId,
        data: {
          ...auditBase,
          failedAt: now,
          reason: result === 'expired' ? 'EXPIRED' : result === 'too-many-attempts' ? 'TOO_MANY_ATTEMPTS' : 'INCORRECT',
        },
      }),
    });

    return false;
  });
};
