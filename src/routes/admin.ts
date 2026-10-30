import type { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { actorFrom, requireRole } from '../lib/auth.js';
import { notFound, validation } from '../lib/errors.js';

export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/users', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const users = await prisma.user.findMany({
      include: { regions: { include: { region: true } } },
      orderBy: { firstName: 'asc' },
    });
    return users.map((user) => ({ ...user, telegramUserId: user.telegramUserId.toString() }));
  });

  app.post('/api/admin/users', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const body = z
      .object({
        telegramUserId: z.string().regex(/^\d+$/),
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        username: z.string().optional(),
        role: z.nativeEnum(Role),
        active: z.boolean().default(true),
        regions: z.array(z.string()).default([]),
      })
      .parse(request.body);
    const regions = await Promise.all(
      body.regions.map((code) =>
        prisma.region.upsert({ where: { code }, update: {}, create: { code, name: code } }),
      ),
    );
    const user = await prisma.user.upsert({
      where: { telegramUserId: BigInt(body.telegramUserId) },
      update: {
        firstName: body.firstName,
        lastName: body.lastName ?? null,
        username: body.username ?? null,
        role: body.role,
        active: body.active,
        regions: { deleteMany: {}, create: regions.map((region) => ({ regionId: region.id })) },
      },
      create: {
        telegramUserId: BigInt(body.telegramUserId),
        firstName: body.firstName,
        lastName: body.lastName ?? null,
        username: body.username ?? null,
        role: body.role,
        active: body.active,
        regions: { create: regions.map((region) => ({ regionId: region.id })) },
      },
      include: { regions: { include: { region: true } } },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: actor.id,
        entityType: 'user',
        entityId: user.id,
        action: 'USER_UPSERTED',
        newValue: {
          telegramUserId: body.telegramUserId,
          role: body.role,
          active: body.active,
          regions: body.regions,
        },
        requestId: request.id,
      },
    });
    return { ...user, telegramUserId: user.telegramUserId.toString() };
  });

  app.get('/api/admin/regions', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    return prisma.region.findMany({ orderBy: { code: 'asc' } });
  });

  app.post('/api/admin/regions', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const body = z
      .object({
        code: z.string().min(1).max(50),
        name: z.string().min(1).max(100),
        active: z.boolean().default(true),
      })
      .parse(request.body);
    return prisma.region.upsert({
      where: { code: body.code },
      update: { name: body.name, active: body.active },
      create: body,
    });
  });

  app.get('/api/admin/chats', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const chats = await prisma.botChat.findMany({ orderBy: { createdAt: 'desc' } });
    return chats.map((chat) => ({ ...chat, telegramChatId: chat.telegramChatId.toString() }));
  });

  app.post('/api/admin/chats', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const body = z
      .object({
        telegramChatId: z.string().regex(/^-?\d+$/),
        chatType: z.string(),
        groupName: z.string().optional(),
        active: z.boolean().default(true),
        importSummaries: z.boolean().default(true),
        reminders: z.boolean().default(true),
        escalations: z.boolean().default(true),
        timezone: z.string().default('Asia/Tehran'),
        reminderSchedule: z.string().default('0 9 * * 1,3'),
      })
      .parse(request.body);
    const data = {
      ...body,
      groupName: body.groupName ?? null,
      telegramChatId: BigInt(body.telegramChatId),
    };
    const chat = await prisma.botChat.upsert({
      where: { telegramChatId: data.telegramChatId },
      update: data,
      create: data,
    });
    return { ...chat, telegramChatId: chat.telegramChatId.toString() };
  });

  app.post('/api/admin/plans/archive', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(request.body);
    return prisma.$transaction(async (tx) => {
      const workflows = await tx.siteWorkflow.findMany({
        where: { active: true },
        select: { id: true, siteId: true },
      });
      const siteIds = [...new Set(workflows.map((item) => item.siteId))];
      const archivedAt = new Date();
      if (workflows.length) {
        await tx.siteWorkflow.updateMany({
          where: { id: { in: workflows.map((item) => item.id) } },
          data: { active: false },
        });
        await tx.site.updateMany({
          where: { id: { in: siteIds } },
          data: { active: false },
        });
      }
      const latestBatch = await tx.importBatch.findFirst({
        where: { status: 'COMMITTED' },
        orderBy: { committedAt: 'desc' },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityType: 'weekly_plan',
          entityId: latestBatch?.id ?? 'active-plan',
          action: 'WEEKLY_PLAN_ARCHIVED',
          oldValue: { activeWorkflows: workflows.length, activeSites: siteIds.length },
          newValue: { archivedAt: archivedAt.toISOString() },
          reason,
          requestId: request.id,
        },
      });
      return {
        archivedAt,
        archivedWorkflows: workflows.length,
        archivedSites: siteIds.length,
        requestId: request.id,
      };
    });
  });

  app.get('/api/admin/templates', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    return prisma.workflowTemplate.findMany({
      include: { steps: { orderBy: { displayOrder: 'asc' } } },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
    });
  });

  app.post('/api/admin/templates/:templateId/clone', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const { templateId } = z.object({ templateId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        reason: z.string().min(1).max(2000),
        steps: z
          .array(
            z.object({
              code: z.string().min(1),
              displayOrder: z.number().int().positive(),
              label: z.string().min(1),
              prerequisiteCode: z.string().nullable(),
              stepType: z.string().min(1),
              allowedAnswers: z.array(z.string().min(1)).min(1),
            }),
          )
          .optional(),
      })
      .parse(request.body);
    return prisma.$transaction(async (tx) => {
      const source = await tx.workflowTemplate.findUnique({
        where: { id: templateId },
        include: { steps: { orderBy: { displayOrder: 'asc' } } },
      });
      if (!source) throw notFound('Workflow template not found.');
      const steps =
        body.steps ??
        source.steps.map((item) => ({ ...item, allowedAnswers: item.allowedAnswers as string[] }));
      const codes = new Set(steps.map((item) => item.code));
      if (
        codes.size !== steps.length ||
        new Set(steps.map((item) => item.displayOrder)).size !== steps.length
      )
        throw validation('Template step codes and display orders must be unique.');
      for (const item of steps) {
        if (item.prerequisiteCode && !codes.has(item.prerequisiteCode))
          throw validation(`Unknown prerequisite ${item.prerequisiteCode}.`);
      }
      const prerequisites = new Map(steps.map((item) => [item.code, item.prerequisiteCode]));
      for (const item of steps) {
        const visited = new Set<string>();
        let cursor: string | null | undefined = item.code;
        while (cursor) {
          if (visited.has(cursor))
            throw validation('Workflow prerequisites cannot contain a cycle.');
          visited.add(cursor);
          cursor = prerequisites.get(cursor);
        }
      }
      const latest = await tx.workflowTemplate.aggregate({
        where: { code: source.code },
        _max: { version: true },
      });
      await tx.workflowTemplate.updateMany({
        where: { code: source.code, active: true },
        data: { active: false, effectiveTo: new Date() },
      });
      const created = await tx.workflowTemplate.create({
        data: {
          code: source.code,
          version: (latest._max.version ?? source.version) + 1,
          siteType: source.siteType,
          sectorAddition: source.sectorAddition,
          steps: {
            create: steps.map((item) => ({
              code: item.code,
              displayOrder: item.displayOrder,
              label: item.label,
              prerequisiteCode: item.prerequisiteCode,
              stepType: item.stepType,
              allowedAnswers: item.allowedAnswers,
            })),
          },
        },
        include: { steps: { orderBy: { displayOrder: 'asc' } } },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityType: 'workflow_template',
          entityId: created.id,
          action: 'TEMPLATE_VERSION_CREATED',
          oldValue: { sourceTemplateId: source.id, version: source.version },
          newValue: { version: created.version },
          reason: body.reason,
          requestId: request.id,
        },
      });
      return created;
    });
  });

  app.post('/api/admin/reclassifications/:membershipId/apply', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const { membershipId } = z.object({ membershipId: z.string().uuid() }).parse(request.params);
    const { reason } = z.object({ reason: z.string().min(1) }).parse(request.body);
    return prisma.$transaction(async (tx) => {
      const membership = await tx.siteBatchMembership.findUnique({
        where: { id: membershipId },
        include: { site: { include: { workflows: true } } },
      });
      if (!membership) throw notFound('Import membership not found.');
      const template = await tx.workflowTemplate.findFirst({
        where: {
          siteType: membership.importedSiteType,
          sectorAddition: membership.importedSectorAddition,
          active: true,
        },
        orderBy: { version: 'desc' },
        include: { steps: true },
      });
      if (!template) throw notFound('Matching workflow template not found.');
      await tx.siteWorkflow.updateMany({
        where: { siteId: membership.siteId, active: true },
        data: { active: false },
      });
      const workflow = await tx.siteWorkflow.create({
        data: {
          siteId: membership.siteId,
          templateId: template.id,
          cycleNumber: membership.site.workflows.length + 1,
          steps: {
            create: template.steps.map((item) => ({
              templateStepId: item.id,
              state: item.prerequisiteCode ? 'LOCKED' : 'ACTIONABLE',
            })),
          },
        },
      });
      await tx.site.update({
        where: { id: membership.siteId },
        data: {
          siteType: membership.importedSiteType,
          sectorAddition: membership.importedSectorAddition,
        },
      });
      await tx.siteBatchMembership.update({
        where: { id: membership.id },
        data: { classificationReviewRequired: false },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityType: 'site_workflow',
          entityId: workflow.id,
          action: 'RECLASSIFICATION_APPLIED',
          reason,
          newValue: {
            siteType: membership.importedSiteType,
            sectorAddition: membership.importedSectorAddition,
          },
          requestId: request.id,
        },
      });
      return { workflowId: workflow.id, requestId: request.id };
    });
  });
}
