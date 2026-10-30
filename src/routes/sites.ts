import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { z } from 'zod';
import type { Config } from '../config.js';
import { prisma } from '../db.js';
import { actorFrom, authorizeServiceCenter, requireRole } from '../lib/auth.js';
import { notFound, validation } from '../lib/errors.js';
import { matchesEvidenceType, safeFilename, sha256 } from '../lib/security.js';
import { reopenBranch, updateSiteStep } from '../services/workflow-service.js';

const filtersSchema = z.object({
  week: z.string().optional(),
  region: z.string().optional(),
  serviceCenter: z.string().optional(),
  siteType: z.enum(['NORMAL', 'SHARED']).optional(),
  sectorAddition: z.enum(['YES', 'NO']).optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED']).optional(),
  assignedUser: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function siteRoutes(app: FastifyInstance, config: Config) {
  app.get('/api/dashboard', async (request) => {
    const actor = await actorFrom(request);
    const scopeWhere =
      actor.role === Role.ADMIN
        ? {}
        : { site: { serviceCenter: { code: { in: actor.serviceCenters } } } };
    const workflows = await prisma.siteWorkflow.findMany({
      where: { active: true, ...scopeWhere },
      include: {
        site: { include: { region: true, serviceCenter: true } },
        steps: { include: { templateStep: true } },
      },
      orderBy: { site: { siteIdText: 'asc' } },
    });
    const statuses = ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'] as const;
    const counts = Object.fromEntries(
      statuses.map((status) => [status, workflows.filter((item) => item.status === status).length]),
    );
    const latestBatch = await prisma.importBatch.findFirst({
      where: { status: 'COMMITTED' },
      orderBy: { committedAt: 'desc' },
    });
    const blocked = workflows
      .filter((item) => item.status === 'BLOCKED')
      .slice(0, 10)
      .map((item) => ({
        ...item,
        steps: item.steps.filter((step) => ['BLOCKED', 'NEEDS_REVIEW'].includes(step.state)),
      }));
    const sitesByStatus = Object.fromEntries(
      statuses.map((status) => [
        status,
        workflows
          .filter((item) => item.status === status)
          .map((item) => ({
            publicId: item.site.publicId,
            siteIdText: item.site.siteIdText,
            region: item.site.region.code,
            serviceCenter: item.site.serviceCenter.code,
            actionableSteps: item.steps
              .filter((step) => step.state === 'ACTIONABLE')
              .map((step) => step.templateStep.label),
          })),
      ]),
    );
    const scopeBreakdown = Object.values(
      workflows.reduce<
        Record<
          string,
          {
            serviceCenter: string;
            regions: Set<string>;
            total: number;
            completed: number;
            blocked: number;
          }
        >
      >(
        (result, workflow) => {
          const serviceCenter = workflow.site.serviceCenter.code;
          const current = result[serviceCenter] ?? {
            serviceCenter,
            regions: new Set<string>(),
            total: 0,
            completed: 0,
            blocked: 0,
          };
          current.regions.add(workflow.site.region.code);
          current.total += 1;
          if (workflow.status === 'COMPLETED') current.completed += 1;
          if (workflow.status === 'BLOCKED') current.blocked += 1;
          result[serviceCenter] = current;
          return result;
        },
        {},
      ),
    )
      .map((item) => ({ ...item, regions: [...item.regions].sort() }))
      .sort((a, b) => a.serviceCenter.localeCompare(b.serviceCenter));
    return {
      total: workflows.length,
      counts,
      latestBatch,
      blocked,
      sitesByStatus,
      scopeBreakdown,
    };
  });

  app.get('/api/sites', async (request) => {
    const actor = await actorFrom(request);
    const filters = filtersSchema.parse(request.query);
    const where = {
      active: true,
      site: {
        ...(actor.role === Role.ADMIN
          ? {}
          : { serviceCenter: { code: { in: actor.serviceCenters } } }),
        ...(filters.region ? { region: { code: filters.region } } : {}),
        ...(filters.serviceCenter ? { serviceCenter: { code: filters.serviceCenter } } : {}),
        ...(filters.siteType ? { siteType: filters.siteType } : {}),
        ...(filters.sectorAddition ? { sectorAddition: filters.sectorAddition } : {}),
        ...(filters.search
          ? { siteIdText: { contains: filters.search, mode: 'insensitive' as const } }
          : {}),
        ...(filters.assignedUser
          ? { assignedUsers: { some: { userId: filters.assignedUser } } }
          : {}),
        ...(filters.week
          ? {
              memberships: {
                some: {
                  batch: { reportingWeek: new Date(filters.week), status: 'COMMITTED' as const },
                },
              },
            }
          : {}),
      },
      ...(filters.status ? { status: filters.status } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.siteWorkflow.findMany({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        orderBy: { site: { siteIdText: 'asc' } },
        include: {
          site: {
            include: {
              region: true,
              serviceCenter: true,
              assignedUsers: {
                include: { user: { select: { id: true, firstName: true, lastName: true } } },
              },
            },
          },
          template: true,
          steps: { select: { state: true } },
        },
      }),
      prisma.siteWorkflow.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        progress: {
          completed: item.steps.filter((step) =>
            ['COMPLETED', 'NOT_APPLICABLE'].includes(step.state),
          ).length,
          total: item.steps.length,
        },
      })),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  });

  app.get('/api/sites/:publicId', async (request) => {
    const actor = await actorFrom(request);
    const { publicId } = z.object({ publicId: z.string().uuid() }).parse(request.params);
    const site = await prisma.site.findUnique({
      where: { publicId },
      include: {
        region: true,
        serviceCenter: true,
        memberships: { include: { batch: true }, orderBy: { createdAt: 'desc' } },
        workflows: {
          where: { active: true },
          include: {
            template: true,
            steps: {
              orderBy: { templateStep: { displayOrder: 'asc' } },
              include: {
                templateStep: true,
                updatedBy: { select: { firstName: true, lastName: true } },
                evidence: true,
                escalation: true,
              },
            },
          },
        },
      },
    });
    if (!site) throw notFound('Site not found.');
    if (!site.active) throw notFound('This site belongs to an archived plan.');
    authorizeServiceCenter(actor, site.serviceCenter.code);
    const workflow = site.workflows[0];
    const audits = workflow
      ? await prisma.auditEvent.findMany({
          where: {
            entityType: 'site_step',
            entityId: { in: workflow.steps.map((item) => item.id) },
          },
          include: { actor: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    return { ...site, workflow, audit: audits };
  });

  app.patch('/api/site-steps/:siteStepId', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN, Role.CONTRIBUTOR]);
    const { siteStepId } = z.object({ siteStepId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        answer: z.string().min(1),
        comment: z.string().max(2000).optional(),
        version: z.number().int().nonnegative(),
      })
      .parse(request.body);
    const step = await prisma.siteStep.findUnique({
      where: { id: siteStepId },
      include: {
        workflow: { include: { site: { include: { region: true, serviceCenter: true } } } },
      },
    });
    if (!step) throw notFound('Site step not found.');
    authorizeServiceCenter(actor, step.workflow.site.serviceCenter.code);
    return updateSiteStep({
      siteStepId,
      answer: body.answer,
      comment: body.comment ?? '',
      expectedVersion: body.version,
      actorId: actor.id,
      actorRole: actor.role,
      requestId: request.id,
    });
  });

  app.post('/api/site-steps/:siteStepId/reopen', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const { siteStepId } = z.object({ siteStepId: z.string().uuid() }).parse(request.params);
    const { reason } = z.object({ reason: z.string().min(1).max(2000) }).parse(request.body);
    return reopenBranch({ siteStepId, reason, actorId: actor.id, requestId: request.id });
  });

  app.post('/api/site-steps/:siteStepId/evidence', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN, Role.CONTRIBUTOR]);
    const { siteStepId } = z.object({ siteStepId: z.string().uuid() }).parse(request.params);
    const step = await prisma.siteStep.findUnique({
      where: { id: siteStepId },
      include: {
        workflow: { include: { site: { include: { region: true, serviceCenter: true } } } },
      },
    });
    if (!step) throw notFound('Site step not found.');
    authorizeServiceCenter(actor, step.workflow.site.serviceCenter.code);
    const upload = await request.file({
      limits: { fileSize: config.MAX_EVIDENCE_BYTES, files: 1 },
    });
    if (!upload) throw validation('Select an evidence file.');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(upload.mimetype))
      throw validation('Evidence must be a JPEG, PNG, WebP, or PDF file.');
    const buffer = await upload.toBuffer();
    if (!matchesEvidenceType(buffer, upload.mimetype))
      throw validation('The evidence content does not match its declared file type.');
    const checksum = sha256(buffer);
    const filename = safeFilename(upload.filename);
    const storageKey = join('evidence', siteStepId, `${checksum}-${filename}`);
    await mkdir(join(config.STORAGE_DIR, 'evidence', siteStepId), { recursive: true });
    await writeFile(join(config.STORAGE_DIR, storageKey), buffer, { flag: 'wx' }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      },
    );
    return prisma.stepEvidence.create({
      data: {
        siteStepId,
        storageKey,
        originalFilename: filename,
        mediaType: upload.mimetype,
        size: buffer.length,
        checksum,
        uploaderId: actor.id,
      },
    });
  });

  app.get('/api/evidence/:evidenceId', async (request, reply) => {
    const actor = await actorFrom(request);
    const { evidenceId } = z.object({ evidenceId: z.string().uuid() }).parse(request.params);
    const evidence = await prisma.stepEvidence.findUnique({
      where: { id: evidenceId },
      include: {
        siteStep: {
          include: {
            workflow: {
              include: { site: { include: { region: true, serviceCenter: true } } },
            },
          },
        },
      },
    });
    if (!evidence) throw notFound('Evidence not found.');
    authorizeServiceCenter(actor, evidence.siteStep.workflow.site.serviceCenter.code);
    return reply
      .header(
        'content-disposition',
        `attachment; filename="${safeFilename(evidence.originalFilename)}"`,
      )
      .type('application/octet-stream')
      .send(createReadStream(join(config.STORAGE_DIR, evidence.storageKey)));
  });
}
