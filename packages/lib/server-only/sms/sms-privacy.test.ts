import { afterEach, describe, expect, it, vi } from 'vitest';

import { DOCUMENT_AUDIT_LOG_TYPE } from '../../types/document-audit-logs';
import { maskPhoneNumber } from '../../universal/sms';
import { createDocumentAuditLogData } from '../../utils/document-audit-logs';
import { createFakeSmsProvider, FAKE_SMS_OTP_CODE } from './fake-sms-provider';
import { createSmsOtpMessage } from './otp-code';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SMS verification privacy', () => {
  it('keeps the OTP and full phone number out of audit data', () => {
    const phoneNumber = '+34600123168';
    const code = '123456';
    const auditBase = {
      recipientEmail: 'signer@example.com',
      recipientName: 'Signer',
      recipientId: 1,
      phoneNumber: maskPhoneNumber(phoneNumber),
    };
    const auditLogs = [
      createDocumentAuditLogData({
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_ACTION_AUTH_SMS_SENT,
        envelopeId: 'envelope_1',
        data: { ...auditBase, sentAt: new Date('2026-11-18T10:00:00.000Z') },
      }),
      createDocumentAuditLogData({
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_ACTION_AUTH_SMS_VERIFIED,
        envelopeId: 'envelope_1',
        data: { ...auditBase, verifiedAt: new Date('2026-11-18T10:01:00.000Z') },
      }),
      createDocumentAuditLogData({
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_ACTION_AUTH_SMS_FAILED,
        envelopeId: 'envelope_1',
        data: { ...auditBase, failedAt: new Date('2026-11-18T10:02:00.000Z'), reason: 'INCORRECT' },
      }),
    ];
    const serializedAuditLogs = JSON.stringify(auditLogs);

    expect(maskPhoneNumber(phoneNumber)).toBe('+34******168');
    expect(serializedAuditLogs).not.toContain(phoneNumber);
    expect(serializedAuditLogs).not.toContain(code);
  });

  it('does not write the OTP or phone number to console logs', async () => {
    const logSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ];
    const phoneNumber = '+34600123168';
    const message = createSmsOtpMessage(FAKE_SMS_OTP_CODE);

    await createFakeSmsProvider().send(phoneNumber, message);

    const serializedLogs = JSON.stringify(logSpies.flatMap((spy) => spy.mock.calls));
    expect(serializedLogs).not.toContain(phoneNumber);
    expect(serializedLogs).not.toContain(FAKE_SMS_OTP_CODE);
  });

  it('uses the required single-part Spanish SMS text', () => {
    const message = createSmsOtpMessage('123456');

    expect(message).toBe('Firmavyn: tu código para firmar es 123456. Caduca en 10 min. No lo compartas.');
    expect(message.length).toBeLessThan(160);
  });
});
