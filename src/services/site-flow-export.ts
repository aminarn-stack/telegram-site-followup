import * as XLSX from 'xlsx';
import type { Role } from '@prisma/client';
import { prisma } from '../db.js';

export interface SiteFlowExportActor {
  role: Role;
  serviceCenters: string[];
}

export interface FlowStepSnapshot {
  state: string;
  answer: string | null;
  updatedAt: Date;
  templateStep: {
    code: string;
    label: string;
    prerequisiteCode: string | null;
    displayOrder: number;
  };
}

const activeStates = new Set(['ACTIONABLE', 'BLOCKED', 'NEEDS_REVIEW']);
const finishedStates = new Set(['COMPLETED', 'NOT_APPLICABLE']);

function displayState(value: string) {
  return value.replaceAll('_', ' ');
}

export function deriveFlowStepSummary(input: FlowStepSnapshot[]) {
  const steps = [...input].sort(
    (left, right) => left.templateStep.displayOrder - right.templateStep.displayOrder,
  );
  let current = steps.filter((step) => activeStates.has(step.state));
  if (!current.length && !steps.every((step) => finishedStates.has(step.state))) {
    const firstUnfinished = steps.find((step) => !finishedStates.has(step.state));
    if (firstUnfinished) current = [firstUnfinished];
  }

  const currentCodes = new Set(current.map((step) => step.templateStep.code));
  const next = steps.filter(
    (step) =>
      step.state === 'LOCKED' &&
      step.templateStep.prerequisiteCode !== null &&
      currentCodes.has(step.templateStep.prerequisiteCode),
  );
  const complete = steps.length > 0 && steps.every((step) => finishedStates.has(step.state));
  const updatedSteps = steps.filter((step) => step.answer);
  const lastUpdatedAt = updatedSteps.length
    ? new Date(Math.max(...updatedSteps.map((step) => step.updatedAt.getTime())))
    : null;

  return {
    currentSteps: complete
      ? 'Completed'
      : current.map((step) => step.templateStep.label).join(', '),
    currentStatuses: complete
      ? 'Completed'
      : current.map((step) => displayState(step.state)).join(', '),
    currentAnswers: current
      .map((step) => step.answer ?? '')
      .filter(Boolean)
      .join(', '),
    nextSteps: next.map((step) => step.templateStep.label).join(', '),
    completedSteps: steps.filter((step) => finishedStates.has(step.state)).length,
    totalSteps: steps.length,
    lastUpdatedAt,
  };
}

export async function createSiteFlowExport(actor: SiteFlowExportActor) {
  const workflows = await prisma.siteWorkflow.findMany({
    where: {
      active: true,
      ...(actor.role === 'ADMIN'
        ? {}
        : { site: { serviceCenter: { code: { in: actor.serviceCenters } } } }),
    },
    include: {
      site: { include: { region: true, serviceCenter: true } },
      steps: {
        include: { templateStep: true },
        orderBy: { templateStep: { displayOrder: 'asc' } },
      },
    },
  });

  const rows = workflows
    .map((workflow) => {
      const flow = deriveFlowStepSummary(workflow.steps);
      return {
        SC: workflow.site.serviceCenter.code,
        Region: workflow.site.region.code,
        'Site ID': workflow.site.siteIdText,
        'Site Status': displayState(workflow.status),
        'Current Steps': flow.currentSteps,
        'Current Step Statuses': flow.currentStatuses,
        'Current Answers': flow.currentAnswers,
        'Next Steps': flow.nextSteps,
        Progress: `${flow.completedSteps}/${flow.totalSteps}`,
        'Last Updated': flow.lastUpdatedAt?.toISOString() ?? '',
      };
    })
    .sort(
      (left, right) =>
        left.SC.localeCompare(right.SC) ||
        left.Region.localeCompare(right.Region) ||
        left['Site ID'].localeCompare(right['Site ID'], undefined, { numeric: true }),
    );

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: [
      'SC',
      'Region',
      'Site ID',
      'Site Status',
      'Current Steps',
      'Current Step Statuses',
      'Current Answers',
      'Next Steps',
      'Progress',
      'Last Updated',
    ],
  });
  sheet['!cols'] = [18, 18, 20, 18, 42, 28, 28, 42, 12, 26].map((wch) => ({ wch }));
  sheet['!autofilter'] = { ref: sheet['!ref'] ?? 'A1:J1' };
  XLSX.utils.book_append_sheet(workbook, sheet, 'Site Flow');

  const date = new Date().toISOString().slice(0, 10);
  return {
    buffer: XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer', compression: true }) as Buffer,
    filename: `site-current-next-steps-${date}.xlsx`,
    siteCount: workflows.length,
  };
}
