import type { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { GrammyError, InputFile, type Api } from 'grammy';
import { z } from 'zod';
import { prisma } from '../db.js';
import { actorFrom, requireRole } from '../lib/auth.js';
import { AppError, forbidden } from '../lib/errors.js';
import { createCurrentStatusExport } from '../services/status-export.js';
import { createSiteFlowExport } from '../services/site-flow-export.js';

function reportScope(role: Role, allowedServiceCenters: string[], requested?: string) {
  return role === Role.ADMIN
    ? {
        role: requested ? Role.VIEWER : Role.ADMIN,
        serviceCenters: requested ? [requested] : [],
      }
    : {
        role: Role.VIEWER,
        serviceCenters: allowedServiceCenters.filter((item) => !requested || item === requested),
      };
}

const exportQuery = z.object({ serviceCenter: z.string().min(1).max(50).optional() });

export async function reportRoutes(app: FastifyInstance, telegram?: Api) {
  const exports = [
    ['/api/reports/export', createCurrentStatusExport],
    ['/api/reports/site-flow', createSiteFlowExport],
  ] as const;
  for (const [path, createExport] of exports) {
    app.get(path, async (request, reply) => {
      const actor = await actorFrom(request);
      const { serviceCenter } = exportQuery.parse(request.query);
      const report = await createExport(
        reportScope(actor.role, actor.serviceCenters, serviceCenter),
      );
      return reply
        .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('content-disposition', `attachment; filename="${report.filename}"`)
        .send(report.buffer);
    });

    app.post(path, async (request) => {
      const actor = await actorFrom(request);
      if (!request.user.telegramVerified)
        throw forbidden('Open the Mini App in Telegram to send an export.');
      if (!telegram)
        throw new AppError(503, 'BOT_NOT_CONFIGURED', 'Telegram bot is not configured.');
      const { serviceCenter } = exportQuery.parse(request.query);
      const user = await prisma.user.findUnique({
        where: { id: actor.id, active: true },
        include: { serviceCenters: { include: { serviceCenter: true } } },
      });
      if (!user || user.telegramUserId.toString() !== actor.telegramUserId) throw forbidden();
      const serviceCenters = user.serviceCenters.map((item) => item.serviceCenter.code);
      const report = await createExport(reportScope(user.role, serviceCenters, serviceCenter));
      try {
        await telegram.sendDocument(
          actor.telegramUserId,
          new InputFile(report.buffer, report.filename),
        );
      } catch (error) {
        if (
          error instanceof GrammyError &&
          (error.error_code === 403 || error.description.includes('chat not found'))
        ) {
          throw new AppError(
            409,
            'TELEGRAM_CHAT_UNAVAILABLE',
            'Open the bot’s private chat, press Start or unblock the bot, then try the export again.',
          );
        }
        request.log.warn(
          { telegramError: error instanceof GrammyError ? error.description : 'Transport error' },
          'Could not send Telegram export',
        );
        throw new AppError(
          502,
          'TELEGRAM_EXPORT_FAILED',
          'Telegram could not receive the export. Please try again.',
        );
      }
      return { ok: true };
    });
  }

  app.get('/api/reports/weekly', async (request) => {
    const actor = await actorFrom(request);
    const { week } = z.object({ week: z.coerce.date() }).parse(request.query);
    const batch = await prisma.importBatch.findFirst({
      where: { reportingWeek: week, status: 'COMMITTED' },
      include: {
        memberships: {
          include: {
            site: {
              include: {
                region: true,
                serviceCenter: true,
                workflows: {
                  where: { active: true },
                  include: { steps: { include: { templateStep: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!batch) return { week, totals: {}, blockersByStep: {}, blockersByRegion: {}, completed: 0 };
    const allowed = batch.memberships.filter(
      (item) =>
        actor.role === Role.ADMIN || actor.serviceCenters.includes(item.site.serviceCenter.code),
    );
    const statuses = allowed
      .map((item) => item.site.workflows[0]?.status)
      .filter(Boolean) as string[];
    const totals = Object.fromEntries(
      ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'].map((status) => [
        status,
        statuses.filter((item) => item === status).length,
      ]),
    );
    const blockedSteps = allowed.flatMap(
      (item) =>
        item.site.workflows[0]?.steps
          .filter((step) => step.state === 'BLOCKED')
          .map((step) => ({ step: step.templateStep.label, region: item.site.region.code })) ?? [],
    );
    const countBy = (keys: string[]) =>
      keys.reduce<Record<string, number>>(
        (acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }),
        {},
      );
    return {
      week,
      totals,
      blockersByStep: countBy(blockedSteps.map((item) => item.step)),
      blockersByRegion: countBy(blockedSteps.map((item) => item.region)),
      completed: totals.COMPLETED,
    };
  });

  app.get('/api/audit', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const filters = z
      .object({
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        actorId: z.string().uuid().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        page: z.coerce.number().int().positive().default(1),
      })
      .parse(request.query);
    const where = {
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        include: { actor: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * 50,
        take: 50,
      }),
      prisma.auditEvent.count({ where }),
    ]);
    return { items, total, page: filters.page };
  });
}
