import { describe, expect, it, vi } from 'vitest';

import { buildZadarmaQuery, createZadarmaSignature, createZadarmaSmsProvider } from './zadarma-sms-provider';

const testMessage = 'Firmavyn: tu código para firmar es 123456. Caduca en 10 min. No lo compartas.';

describe('ZadarmaSmsProvider', () => {
  it('matches the official PHP signing algorithm with sorted parameters', () => {
    const query = buildZadarmaQuery({
      sender: 'Firmavyn',
      message: testMessage,
      number: '34600123168',
    });

    expect(query).toBe(
      'message=Firmavyn%3A+tu+c%C3%B3digo+para+firmar+es+123456.+Caduca+en+10+min.+No+lo+compartas.&number=34600123168&sender=Firmavyn',
    );
    expect(createZadarmaSignature({ method: '/v1/sms/send/', query, apiSecret: 'test-secret' })).toBe(
      'NzI3ZTQ4ZDdhZTczYTI4NTQ2YTZlYTNiYjkwZTViYTliNjM5NTIwZA==',
    );
  });

  it('returns the API cost for a successful send', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', messages: 1, cost: 0.24, currency: 'EUR' }), {
        status: 200,
      }),
    );
    const provider = createZadarmaSmsProvider({
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      sender: 'Firmavyn',
      fetchImplementation,
    });

    await expect(provider.send('+34600123168', testMessage)).resolves.toEqual({
      ok: true,
      cost: 0.24,
      currency: 'EUR',
    });

    const [, request] = fetchImplementation.mock.calls[0];
    expect(request.headers.Authorization).toMatch(/^test-key:[A-Za-z0-9+/=]+$/);
    expect(request.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(request.body).not.toContain('+34600123168');
  });

  it('returns a safe error for an API error', async () => {
    const provider = createZadarmaSmsProvider({
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      fetchImplementation: vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ status: 'error', message: 'Check phone number' }), { status: 200 }),
        ),
    });

    await expect(provider.send('+34600123168', testMessage)).resolves.toEqual({
      ok: false,
      error: 'SMS provider rejected the request',
    });
  });

  it('treats denied numbers as a failed send', async () => {
    const provider = createZadarmaSmsProvider({
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      fetchImplementation: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'success',
            denied_numbers: [{ number: '34600123168', message: 'Denied' }],
          }),
          { status: 200 },
        ),
      ),
    });

    await expect(provider.send('+34600123168', testMessage)).resolves.toEqual({
      ok: false,
      error: 'SMS provider denied the destination number',
    });
  });
});
