import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import type { Config } from '../config.js';
import { validateTelegramInitData } from '../lib/security.js';
import { AppError } from '../lib/errors.js';

const bodySchema = z.object({ initData: z.string().min(1) });

async function issueSession(app: FastifyInstance, telegramUserId: bigint) {
  const user = await prisma.user.findUnique({
    where: { telegramUserId },
    include: { regions: { include: { region: true } } },
  });
  if (!user?.active)
    throw new AppError(403, 'ACCESS_DENIED', 'Your Telegram account is not authorized.');
  const regions = user.regions.map((item) => item.region.code);
  const token = app.jwt.sign(
    { sub: user.id, telegramUserId: user.telegramUserId.toString(), role: user.role, regions },
    { expiresIn: '8h' },
  );
  return {
    token,
    user: {
      id: user.id,
      telegramUserId: user.telegramUserId.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      role: user.role,
      regions,
    },
  };
}

export async function authRoutes(app: FastifyInstance, config: Config) {
  app.post('/api/auth/telegram', async (request) => {
    if (!config.TELEGRAM_BOT_TOKEN) {
      throw new AppError(503, 'BOT_NOT_CONFIGURED', 'Telegram authentication is not configured.');
    }
    const { initData } = bodySchema.parse(request.body);
    const telegram = validateTelegramInitData(
      initData,
      config.TELEGRAM_BOT_TOKEN,
      config.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
    );
    const result = await issueSession(app, BigInt(telegram.id));
    await prisma.user.update({
      where: { id: result.user.id },
      data: {
        firstName: telegram.first_name,
        lastName: telegram.last_name ?? null,
        username: telegram.username ?? null,
      },
    });
    return result;
  });

  if (config.NODE_ENV !== 'production') {
    app.post('/api/auth/dev', async (request) => {
      const body = z.object({ telegramUserId: z.string().regex(/^\d+$/) }).parse(request.body);
      return issueSession(app, BigInt(body.telegramUserId));
    });
  }
}
