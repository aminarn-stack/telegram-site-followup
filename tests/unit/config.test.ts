import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

const required = {
  DATABASE_URL: 'postgresql://followup:secret@postgres:5432/followup',
  JWT_SECRET: 'a'.repeat(32),
  TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
};

describe('configuration', () => {
  it('accepts a public HTTPS IP address', () => {
    const config = loadConfig({
      ...required,
      NODE_ENV: 'production',
      PUBLIC_BASE_URL: 'https://203.0.113.10',
      WEB_ORIGIN: 'https://203.0.113.10',
      TRUST_PROXY: 'true',
    });

    expect(config.PUBLIC_BASE_URL).toBe('https://203.0.113.10');
    expect(config.TRUST_PROXY).toBe(true);
  });

  it('does not treat the string false as true', () => {
    const config = loadConfig({ ...required, TRUST_PROXY: 'false' });
    expect(config.TRUST_PROXY).toBe(false);
  });
});
