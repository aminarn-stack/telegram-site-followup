import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:5432/unused';
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-thirty-two-characters';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret';
  const module = await import('../../src/server.js');
  app = await module.buildServer();
});

afterAll(async () => app?.close());

describe('API security contract', () => {
  it('returns a stable request ID and safe error for unauthenticated access', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    });
    expect(response.json().error.requestId).toEqual(expect.any(String));
  });

  it('rejects a webhook without the configured Telegram secret', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/telegram/webhook',
      payload: {},
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_WEBHOOK_SECRET');
  });
});
