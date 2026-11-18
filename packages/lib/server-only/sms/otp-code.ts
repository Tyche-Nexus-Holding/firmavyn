import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

export const generateSmsOtpCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

export const hashSmsOtpCode = (code: string, salt = randomBytes(16).toString('hex')) => ({
  hash: scryptSync(code, salt, 32).toString('hex'),
  salt,
});

export const verifySmsOtpCodeHash = ({ code, hash, salt }: { code: string; hash: string; salt: string }): boolean => {
  const actualHash = scryptSync(code, salt, 32);
  const expectedHash = Buffer.from(hash, 'hex');

  return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
};

export const createSmsOtpMessage = (code: string): string =>
  `Firmavyn: tu código para firmar es ${code}. Caduca en 10 min. No lo compartas.`;
