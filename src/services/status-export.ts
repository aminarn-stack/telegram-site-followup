import * as XLSX from 'xlsx';
import type { Role } from '@prisma/client';
import { prisma } from '../db.js';

export interface ExportActor {
  role: Role;
  regions: string[];
}

function setColumnWidths(sheet: XLSX.WorkSheet, widths: number[]) {
  sheet['!cols'] = widths.map((wch) => ({ wch }));
}

export async function createCurrentStatusExport(actor: ExportActor) {
  const workflows = await prisma.siteWorkflow.findMany({
    where: {
      active: true,
      ...(actor.role === 'ADMIN' ? {} : { site: { region: { code: { in: actor.regions } } } }),
    },
    include: {
      site: { include: { region: true } },
      template: true,
      steps: {
        orderBy: { templateStep: { displayOrder: 'asc' } },
        include: {
          templateStep: true,
          updatedBy: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { site: { siteIdText: 'asc' } },
  });

  const summaryRows = workflows.map((workflow) => {
    const completed = workflow.steps.filter((step) =>
      ['COMPLETED', 'NOT_APPLICABLE'].includes(step.state),
    ).length;
    const blocked = workflow.steps
      .filter((step) => step.state === 'BLOCKED' || step.state === 'NEEDS_REVIEW')
      .map((step) => step.templateStep.label)
      .join(', ');
    const actionable = workflow.steps
      .filter((step) => step.state === 'ACTIONABLE')
      .map((step) => step.templateStep.label)
      .join(', ');
    return {
      'Site ID': workflow.site.siteIdText,
      Region: workflow.site.region.code,
      'Site Type': workflow.site.siteType,
      'Sector Addition': workflow.site.sectorAddition,
      Status: workflow.status.replaceAll('_', ' '),
      Progress: `${completed}/${workflow.steps.length}`,
      'Actionable Step': actionable,
      'Blocked Step': blocked,
      'Cycle Number': workflow.cycleNumber,
      'Started At': workflow.startedAt.toISOString(),
      'Completed At': workflow.completedAt?.toISOString() ?? '',
    };
  });

  const detailRows = workflows.flatMap((workflow) =>
    workflow.steps.map((step) => ({
      'Site ID': workflow.site.siteIdText,
      Region: workflow.site.region.code,
      'Site Status': workflow.status.replaceAll('_', ' '),
      'Step Order': step.templateStep.displayOrder,
      Step: step.templateStep.label,
      'Step Status': step.state.replaceAll('_', ' '),
      Answer: step.answer ?? '',
      Comment: step.comment ?? '',
      'Updated By': step.updatedBy
        ? `${step.updatedBy.firstName}${step.updatedBy.lastName ? ` ${step.updatedBy.lastName}` : ''}`
        : '',
      'Updated At': step.answer ? step.updatedAt.toISOString() : '',
    })),
  );

  const workbook = XLSX.utils.book_new();
  const summary = XLSX.utils.json_to_sheet(summaryRows, {
    header: [
      'Site ID',
      'Region',
      'Site Type',
      'Sector Addition',
      'Status',
      'Progress',
      'Actionable Step',
      'Blocked Step',
      'Cycle Number',
      'Started At',
      'Completed At',
    ],
  });
  const details = XLSX.utils.json_to_sheet(detailRows, {
    header: [
      'Site ID',
      'Region',
      'Site Status',
      'Step Order',
      'Step',
      'Step Status',
      'Answer',
      'Comment',
      'Updated By',
      'Updated At',
    ],
  });
  setColumnWidths(summary, [18, 14, 14, 16, 16, 12, 34, 34, 14, 24, 24]);
  setColumnWidths(details, [18, 14, 16, 12, 34, 18, 22, 45, 24, 24]);
  summary['!autofilter'] = { ref: summary['!ref'] ?? 'A1:K1' };
  details['!autofilter'] = { ref: details['!ref'] ?? 'A1:J1' };
  XLSX.utils.book_append_sheet(workbook, summary, 'Current Status');
  XLSX.utils.book_append_sheet(workbook, details, 'Step Details');

  const date = new Date().toISOString().slice(0, 10);
  return {
    buffer: XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer', compression: true }) as Buffer,
    filename: `site-status-${date}.xlsx`,
    siteCount: workflows.length,
  };
}
