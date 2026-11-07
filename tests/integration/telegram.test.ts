import type { FastifyInstance } from 'fastify';
import { Api, GrammyError } from 'grammy';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/db.js';

vi.mock('../../src/db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({
        id: 'user-1',
        role: 'CONTRIBUTOR',
        telegramUserId: 101n,
        serviceCenters: [{ serviceCenter: { code: 'SC-A' } }],
      })),
    },
    botChat: {
      findUnique: vi.fn(async () => ({
        active: true,
        serviceCenters: [{ serviceCenter: { code: 'SC-A' } }],
      })),
    },
    siteWorkflow: { findMany: vi.fn(async () => []) },
  },
}));

const botUser = {
  id: 202,
  is_bot: true as const,
  first_name: 'Follow-up',
  username: 'followup_test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};
const telegramUser = { id: 101, is_bot: false, first_name: 'Test' };
const privateChat = { id: 101, type: 'private', first_name: 'Test' } as const;
const groupChat = { id: -303, type: 'supergroup', title: 'Test group' } as const;
const sentDocument = {
  message_id: 2,
  date: 0,
  chat: privateChat,
  document: { file_id: 'test-file', file_unique_id: 'unique-test-file' },
};
const webhookSecret = 'telegram-test-webhook-secret';
let app: FastifyInstance;

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgresql://unused:unused@127.0.0.1:5432/unused');
  vi.stubEnv('JWT_SECRET', 'test-secret-that-is-at-least-thirty-two-characters');
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', webhookSecret);
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '202:test-bot-token');
  vi.stubEnv('PUBLIC_BASE_URL', 'https://example.com');
  const { buildServer } = await import('../../src/server.js');
  app = await buildServer();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

function webhook(text: string, chat: typeof privateChat | typeof groupChat = privateChat) {
  return app.inject({
    method: 'POST',
    url: '/api/telegram/webhook',
    headers: { 'x-telegram-bot-api-secret-token': webhookSecret },
    payload: {
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        from: telegramUser,
        chat,
        text,
        entities: [{ type: 'bot_command', offset: 0, length: text.length }],
      },
    },
  });
}

function telegramSession(telegramVerified = true) {
  return app.jwt.sign({
    sub: 'user-1',
    telegramUserId: '101',
    telegramVerified,
    role: 'ADMIN',
    regions: [],
    serviceCenters: [],
  });
}

describe('Telegram commands and exports', () => {
  it('initializes the webhook bot and uses the right keyboard for each chat', async () => {
    const getMe = vi.spyOn(Api.prototype, 'getMe').mockResolvedValue(botUser);
    const send = vi.spyOn(Api.prototype, 'sendMessage').mockImplementation(async (id, text) => ({
      message_id: 2,
      date: 0,
      chat: id === 101 ? privateChat : groupChat,
      text,
    }));

    expect((await webhook('/open')).statusCode).toBe(200);
    expect((await webhook('/open@followup_test_bot', groupChat)).statusCode).toBe(200);
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenNthCalledWith(
      1,
      101,
      expect.any(String),
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [[{ text: 'Open App', web_app: { url: 'https://example.com/' } }]],
        },
      }),
      undefined,
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      -303,
      expect.any(String),
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Open bot in private', url: 'https://t.me/followup_test_bot?start=open' }],
          ],
        },
      }),
      undefined,
    );
  });

  it.each([
    ['export', 'site-status-'],
    ['flowexport', 'site-current-next-steps-'],
  ])('sends /%s as a workbook in the originating group', async (command, prefix) => {
    vi.spyOn(Api.prototype, 'getMe').mockResolvedValue(botUser);
    const send = vi.spyOn(Api.prototype, 'sendDocument').mockResolvedValue(sentDocument);
    expect((await webhook(`/${command}@followup_test_bot`, groupChat)).statusCode).toBe(200);
    expect(send).toHaveBeenCalledWith(
      -303,
      expect.objectContaining({
        filename: expect.stringMatching(new RegExp(`^${prefix}.*\\.xlsx$`)),
      }),
      expect.objectContaining({ caption: expect.any(String) }),
      undefined,
    );
    expect(prisma.siteWorkflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true, site: { serviceCenter: { code: { in: ['SC-A'] } } } },
      }),
    );
  });

  it.each(['/api/reports/export', '/api/reports/site-flow'])(
    'sends %s from the Mini App to the verified user only, using current SC access',
    async (url) => {
      const send = vi.spyOn(Api.prototype, 'sendDocument').mockResolvedValue(sentDocument);
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${telegramSession()}` },
        payload: { chatId: '-303' },
      });
      expect(response.statusCode).toBe(200);
      expect(send).toHaveBeenCalledWith(
        '101',
        expect.objectContaining({ filename: expect.stringMatching(/\.xlsx$/) }),
      );
      expect(prisma.siteWorkflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { active: true, site: { serviceCenter: { code: { in: ['SC-A'] } } } },
        }),
      );
    },
  );

  it('requires Telegram authentication and explains when the private chat is unavailable', async () => {
    const send = vi
      .spyOn(Api.prototype, 'sendDocument')
      .mockRejectedValue(
        new GrammyError(
          'sendDocument failed',
          { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' },
          'sendDocument',
          {},
        ),
      );
    const url = '/api/reports/export';
    const unverified = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${telegramSession(false)}` },
    });
    expect(unverified.statusCode).toBe(403);
    expect(send).not.toHaveBeenCalled();

    const blocked = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${telegramSession()}` },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('TELEGRAM_CHAT_UNAVAILABLE');
  });
});
