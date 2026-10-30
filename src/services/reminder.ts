import type { Prisma, SiteStatus, WorkflowState } from '@prisma/client';
import { prisma } from '../db.js';

export interface ReminderWorkflow {
  status: SiteStatus;
  steps: { state: WorkflowState }[];
}

export function summarizeReminderWorkflows(workflows: readonly ReminderWorkflow[]) {
  return {
    actionable: workflows.filter(
      (workflow) =>
        (workflow.status === 'NOT_STARTED' || workflow.status === 'IN_PROGRESS') &&
        workflow.steps.some((step) => step.state === 'ACTIONABLE'),
    ).length,
    blocked: workflows.filter((workflow) => workflow.status === 'BLOCKED').length,
  };
}

export async function getReminderStats(scope: Prisma.SiteWorkflowWhereInput = {}) {
  const workflows = await prisma.siteWorkflow.findMany({
    where: { active: true, ...scope },
    select: { status: true, steps: { select: { state: true } } },
  });
  return summarizeReminderWorkflows(workflows);
}
