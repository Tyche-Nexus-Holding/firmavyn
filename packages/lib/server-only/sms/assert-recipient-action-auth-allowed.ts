import { AppError, AppErrorCode } from '../../errors/app-error';
import type { TRecipientActionAuthTypes } from '../../types/document-auth';
import { DocumentAuth } from '../../types/document-auth';
import type { TClaimFlags } from '../../types/subscription';
import { getSmsVerificationPlan } from './sms-usage';

export const assertRecipientActionAuthAllowed = ({
  actionAuth,
  flags,
}: {
  actionAuth: Array<TRecipientActionAuthTypes[] | undefined>;
  flags: TClaimFlags;
}) => {
  const requestedAuthMethods = actionAuth.flatMap((methods) => methods ?? []);
  const hasSms = requestedAuthMethods.includes(DocumentAuth.SMS);
  const hasEnterpriseActionAuth = requestedAuthMethods.some((method) => method !== DocumentAuth.SMS);

  if (hasSms && getSmsVerificationPlan(flags.smsVerification) === 'free') {
    throw new AppError(AppErrorCode.UNAUTHORIZED, {
      message: 'SMS verification is available on the Basic plan',
    });
  }

  if (hasEnterpriseActionAuth && !flags.cfr21) {
    throw new AppError(AppErrorCode.UNAUTHORIZED, {
      message: 'You do not have permission to set the action auth',
    });
  }
};
