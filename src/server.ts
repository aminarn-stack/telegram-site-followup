import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { loadConfig } from './config.js';
import { prisma } from './db.js';
import { AppError } from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { importRoutes } from './routes/imports.js';
import { siteRoutes } from './routes/sites.js';
import { reportRoutes } from './routes/reports.js';
import { adminRoutes } from './routes/admin.js';
import { telegramRoutes } from './routes/telegram.js';

export async function buildServer() {
  const config = loadConfig();
  const app = Fastify({ logger: { level: config.LOG_LEVEL }, genReqId: () => crypto.randomUUID() });
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: false });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  });
  await app.register(jwt, { secret: config.JWT_SECRET });
  await app.register(multipart, { limits: { files: 1, fields: 10, parts: 11 } });

  app.get('/api/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', time: new Date().toISOString() };
  });
  await authRoutes(app, config);
  await importRoutes(app, config);
  await siteRoutes(app, config);
  await reportRoutes(app);
  await adminRoutes(app);
  await telegramRoutes(app, config);

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request is invalid.',
          details: error.issues,
          requestId,
        },
      });
    }
    if (error instanceof AppError) {
      if (error.statusCode >= 500) request.log.error({ err: error, requestId });
      else request.log.warn({ code: error.code, requestId });
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details, requestId },
      });
    }
    request.log.error({ err: error, requestId });
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', requestId },
    });
  });

  const webRoot = resolve('web-dist');
  if (existsSync(webRoot)) {
    const { default: staticPlugin } = await import('@fastify/static');
    await app.register(staticPlugin, { root: webRoot, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/'))
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'API route not found.', requestId: request.id },
        });
      return reply.sendFile('index.html');
    });
  }
  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const config = loadConfig();
  const app = await buildServer();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}
