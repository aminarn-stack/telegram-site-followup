import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { createBot, resolveDeepLink } from '../bot.js';
import { AppError } from '../lib/errors.js';
import { z } from 'zod';

export async function telegramRoutes(app: FastifyInstance, config: Config) {
  const bot = createBot(config);
  app.post('/api/telegram/webhook', async (request, reply) => {
    const secret = request.headers['x-telegram-bot-api-secret-token'];
    if (secret !== config.TELEGRAM_WEBHOOK_SECRET)
      throw new AppError(401, 'INVALID_WEBHOOK_SECRET', 'Invalid Telegram webhook secret.');
    if (!bot) throw new AppError(503, 'BOT_NOT_CONFIGURED', 'Telegram bot is not configured.');
    await bot.handleUpdate(request.body as Parameters<typeof bot.handleUpdate>[0]);
    return reply.send({ ok: true });
  });
  app.get('/api/deep-links/:token', async (request) => {
    const { token } = z.object({ token: z.string().min(20).max(100) }).parse(request.params);
    const target = await resolveDeepLink(token);
    if (!target) throw new AppError(404, 'LINK_NOT_FOUND', 'This link is invalid or expired.');
    return target;
  });
}
