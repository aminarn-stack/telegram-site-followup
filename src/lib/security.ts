import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { basename } from 'node:path';
import { AppError } from './errors.js';

export interface TelegramUserData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number,
  now = Math.floor(Date.now() / 1000),
): TelegramUserData {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[0-9a-f]{64}$/i.test(receivedHash)) {
    throw new AppError(
      401,
      'INVALID_TELEGRAM_AUTH',
      'Telegram authentication signature is missing.',
    );
  }
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  const received = Buffer.from(receivedHash, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new AppError(
      401,
      'INVALID_TELEGRAM_AUTH',
      'Telegram authentication signature is invalid.',
    );
  }
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || now - authDate > maxAgeSeconds || authDate > now + 60) {
    throw new AppError(401, 'EXPIRED_TELEGRAM_AUTH', 'Telegram authentication has expired.');
  }
  const user = JSON.parse(params.get('user') ?? 'null') as TelegramUserData | null;
  if (!user?.id || !user.first_name) {
    throw new AppError(401, 'INVALID_TELEGRAM_AUTH', 'Telegram user data is missing.');
  }
  return user;
}

export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function safeFilename(value: string): string {
  return (
    basename(value)
      .replaceAll(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120) || 'upload.bin'
  );
}

export function opaqueToken(): string {
  return randomBytes(24).toString('base64url');
}

export function matchesEvidenceType(buffer: Buffer, mediaType: string): boolean {
  const hex = buffer.subarray(0, 12).toString('hex');
  if (mediaType === 'image/jpeg') return hex.startsWith('ffd8ff');
  if (mediaType === 'image/png') return hex.startsWith('89504e470d0a1a0a');
  if (mediaType === 'image/webp')
    return (
      buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP'
    );
  if (mediaType === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  return false;
}
