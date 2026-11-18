import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { DocumentAuth, type TRecipientActionAuth } from '@documenso/lib/types/document-auth';
import { trpc } from '@documenso/trpc/react';
import { Alert, AlertDescription, AlertTitle } from '@documenso/ui/primitives/alert';
import { Button } from '@documenso/ui/primitives/button';
import { DialogFooter } from '@documenso/ui/primitives/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@documenso/ui/primitives/form/form';
import { PinInput, PinInputGroup, PinInputSlot } from '@documenso/ui/primitives/pin-input';
import { zodResolver } from '@hookform/resolvers/zod';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useRequiredDocumentSigningAuthContext } from './document-signing-auth-provider';

const ZSmsAuthFormSchema = z.object({
  code: z.string().regex(/^\d{6}$/, { message: msg`Enter the 6-digit code`.id }),
});

type TSmsAuthFormSchema = z.infer<typeof ZSmsAuthFormSchema>;

export type DocumentSigningAuthSmsProps = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onReauthFormSubmit: (values?: TRecipientActionAuth) => Promise<void> | void;
};

export const DocumentSigningAuthSms = ({ open, onOpenChange, onReauthFormSubmit }: DocumentSigningAuthSmsProps) => {
  const { recipient, isCurrentlyAuthenticating, setIsCurrentlyAuthenticating } =
    useRequiredDocumentSigningAuthContext();
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [retryAt, setRetryAt] = useState<Date | null>(null);
  const [secondsUntilRetry, setSecondsUntilRetry] = useState(0);
  const [sendErrorCode, setSendErrorCode] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState(false);

  const requestSmsMutation = trpc.document.actionAuth.requestSms.useMutation();
  const form = useForm<TSmsAuthFormSchema>({
    resolver: zodResolver(ZSmsAuthFormSchema),
    defaultValues: { code: '' },
  });

  useEffect(() => {
    if (!retryAt) {
      setSecondsUntilRetry(0);
      return;
    }

    const updateSeconds = () => {
      setSecondsUntilRetry(Math.max(0, Math.ceil((retryAt.getTime() - Date.now()) / 1000)));
    };

    updateSeconds();
    const interval = window.setInterval(updateSeconds, 1000);

    return () => window.clearInterval(interval);
  }, [retryAt]);

  useEffect(() => {
    if (!open) {
      form.reset({ code: '' });
      setIsCodeSent(false);
      setRetryAt(null);
      setSendErrorCode(null);
      setVerifyError(false);
    }
  }, [form, open]);

  const onSendCode = async () => {
    setSendErrorCode(null);

    try {
      const response = await requestSmsMutation.mutateAsync({ token: recipient.token });
      setIsCodeSent(true);
      setRetryAt(response.retryAt);
    } catch (error) {
      setSendErrorCode(AppError.parseError(error).code);
    }
  };

  const onSubmit = async ({ code }: TSmsAuthFormSchema) => {
    setIsCurrentlyAuthenticating(true);
    setVerifyError(false);

    try {
      await onReauthFormSubmit({ type: DocumentAuth.SMS, code });
      onOpenChange(false);
    } catch {
      setVerifyError(true);
    } finally {
      setIsCurrentlyAuthenticating(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <fieldset disabled={isCurrentlyAuthenticating} className="space-y-4">
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={onSendCode}
              loading={requestSmsMutation.isPending}
              disabled={secondsUntilRetry > 0}
            >
              {isCodeSent ? <Trans>Resend code by SMS</Trans> : <Trans>Send code by SMS</Trans>}
            </Button>

            {secondsUntilRetry > 0 && (
              <p className="text-muted-foreground text-sm">
                <Trans>Request another code in {secondsUntilRetry} seconds</Trans>
              </p>
            )}
          </div>

          {sendErrorCode && (
            <Alert variant="destructive">
              <AlertTitle>
                <Trans>SMS could not be sent</Trans>
              </AlertTitle>
              <AlertDescription>
                {sendErrorCode === AppErrorCode.FORBIDDEN ? (
                  <Trans>Available on the Basic plan</Trans>
                ) : sendErrorCode === AppErrorCode.LIMIT_EXCEEDED ? (
                  <Trans>The maximum of 3 SMS sends has been reached</Trans>
                ) : sendErrorCode === AppErrorCode.TOO_MANY_REQUESTS ? (
                  <Trans>Wait 60 seconds before requesting another code</Trans>
                ) : (
                  <Trans>Try again later</Trans>
                )}
              </AlertDescription>
            </Alert>
          )}

          {isCodeSent && (
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>
                    <Trans>6-digit SMS code</Trans>
                  </FormLabel>
                  <FormControl>
                    <PinInput {...field} value={field.value} maxLength={6} inputMode="numeric">
                      {Array.from({ length: 6 }, (_, index) => (
                        <PinInputGroup key={index}>
                          <PinInputSlot index={index} />
                        </PinInputGroup>
                      ))}
                    </PinInput>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {verifyError && (
            <Alert variant="destructive">
              <AlertTitle>
                <Trans>Code not valid</Trans>
              </AlertTitle>
              <AlertDescription>
                <Trans>The code is incorrect, expired, or has exceeded the maximum number of attempts</Trans>
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button type="submit" loading={isCurrentlyAuthenticating} disabled={!isCodeSent}>
              <Trans>Verify and sign</Trans>
            </Button>
          </DialogFooter>
        </fieldset>
      </form>
    </Form>
  );
};
