import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateTelegramInitData } from '../../src/lib/security.js';

function signedInitData(token: string, authDate: number) {
  const user = JSON.stringify({ id: 42, first_name: 'Ada', username: 'ada' });
  const values = new URLSearchParams({ auth_date: String(authDate), query_id: 'q-1', user });
  const check = [...values.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  values.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return values.toString();
}

describe('Telegram initData validation', () => {
  it('accepts a valid signature and returns the Telegram identity', () => {
    expect(
      validateTelegramInitData(signedInitData('token:secret', 1000), 'token:secret', 3600, 1100),
    ).toMatchObject({ id: 42, first_name: 'Ada' });
  });
  it('rejects a changed signature and expired data', () => {
    expect(() =>
      validateTelegramInitData(
        signedInitData('token:secret', 1000).replace('Ada', 'Eve'),
        'token:secret',
        3600,
        1100,
      ),
    ).toThrow();
    expect(() =>
      validateTelegramInitData(signedInitData('token:secret', 1000), 'token:secret', 100, 1101),
    ).toThrow(/expired/i);
  });
});
