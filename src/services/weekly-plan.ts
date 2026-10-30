import type { Prisma } from '@prisma/client';

export async function archiveWeeklyPlan(
  tx: Prisma.TransactionClient,
  input: { actorId: string; reason: string; requestId: string },
) {
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
      actorId: input.actorId,
      entityType: 'weekly_plan',
      entityId: latestBatch?.id ?? 'active-plan',
      action: 'WEEKLY_PLAN_ARCHIVED',
      oldValue: { activeWorkflows: workflows.length, activeSites: siteIds.length },
      newValue: { archivedAt: archivedAt.toISOString() },
      reason: input.reason,
      requestId: input.requestId,
    },
  });
  return {
    archivedAt,
    archivedWorkflows: workflows.length,
    archivedSites: siteIds.length,
    requestId: input.requestId,
  };
}
