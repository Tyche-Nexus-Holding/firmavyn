import { sendSmsVerification } from '@documenso/lib/server-only/sms/send-sms-verification';

import { procedure } from '../trpc';
import {
  ZActionAuthRequestSmsRequestSchema,
  ZActionAuthRequestSmsResponseSchema,
} from './action-auth-request-sms.types';

export const actionAuthRequestSmsRoute = procedure
  .input(ZActionAuthRequestSmsRequestSchema)
  .output(ZActionAuthRequestSmsResponseSchema)
  .mutation(async ({ input }) => {
    return await sendSmsVerification({ recipientToken: input.token });
  });
