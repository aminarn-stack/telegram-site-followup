import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { archiveWeeklyPlan } from '../../src/services/weekly-plan.js';

describe('weekly plan archive', () => {
  it('deactivates only sites and workflows and leaves access assignments untouched', async () => {
    const userAccessDelete = vi.fn();
    const groupAccessDelete = vi.fn();
    const tx = {
      siteWorkflow: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'workflow-1', siteId: 'site-1' },
          { id: 'workflow-2', siteId: 'site-2' },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      site: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      importBatch: { findFirst: vi.fn().mockResolvedValue({ id: 'batch-1' }) },
      auditEvent: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
      userServiceCenter: { deleteMany: userAccessDelete },
      botChatServiceCenter: { deleteMany: groupAccessDelete },
    } as unknown as Prisma.TransactionClient;

    const result = await archiveWeeklyPlan(tx, {
      actorId: 'admin-1',
      reason: 'End of week',
      requestId: 'request-1',
    });

    expect(tx.siteWorkflow.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['workflow-1', 'workflow-2'] } },
      data: { active: false },
    });
    expect(tx.site.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['site-1', 'site-2'] } },
      data: { active: false },
    });
    expect(userAccessDelete).not.toHaveBeenCalled();
    expect(groupAccessDelete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ archivedWorkflows: 2, archivedSites: 2 });
  });

  it('can be repeated safely when there is no active plan', async () => {
    const tx = {
      siteWorkflow: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
      },
      site: { updateMany: vi.fn() },
      importBatch: { findFirst: vi.fn().mockResolvedValue(null) },
      auditEvent: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    } as unknown as Prisma.TransactionClient;

    const result = await archiveWeeklyPlan(tx, {
      actorId: 'admin-1',
      reason: 'No active plan',
      requestId: 'request-2',
    });

    expect(tx.siteWorkflow.updateMany).not.toHaveBeenCalled();
    expect(tx.site.updateMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ archivedWorkflows: 0, archivedSites: 0 });
  });
});
