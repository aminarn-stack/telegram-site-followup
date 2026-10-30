import * as XLSX from 'xlsx';
import type { Role } from '@prisma/client';
import { prisma } from '../db.js';

export interface ExportActor {
  role: Role;
  serviceCenters: string[];
}

function setColumnWidths(sheet: XLSX.WorkSheet, widths: number[]) {
  sheet['!cols'] = widths.map((wch) => ({ wch }));
}

export async function createCurrentStatusExport(actor: ExportActor) {
  const workflows = await prisma.siteWorkflow.findMany({
    where: {
      active: true,
      ...(actor.role === 'ADMIN'
        ? {}
        : { site: { serviceCenter: { code: { in: actor.serviceCenters } } } }),
    },
    include: {
      site: { include: { region: true, serviceCenter: true } },
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
      SC: workflow.site.serviceCenter.code,
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
      SC: workflow.site.serviceCenter.code,
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

  const scopeRows = Object.values(
    workflows.reduce<
      Record<
        string,
        {
          SC: string;
          regionSet: Set<string>;
          Total: number;
          'Not Started': number;
          'In Progress': number;
          Blocked: number;
          Completed: number;
        }
      >
    >((rows, workflow) => {
      const key = workflow.site.serviceCenter.code;
      const row = rows[key] ?? {
        SC: key,
        regionSet: new Set<string>(),
        Total: 0,
        'Not Started': 0,
        'In Progress': 0,
        Blocked: 0,
        Completed: 0,
      };
      row.regionSet.add(workflow.site.region.code);
      row.Total += 1;
      if (workflow.status === 'NOT_STARTED') row['Not Started'] += 1;
      if (workflow.status === 'IN_PROGRESS') row['In Progress'] += 1;
      if (workflow.status === 'BLOCKED') row.Blocked += 1;
      if (workflow.status === 'COMPLETED') row.Completed += 1;
      rows[key] = row;
      return rows;
    }, {}),
  )
    .map(({ regionSet, ...row }) => ({ ...row, Regions: [...regionSet].sort().join(', ') }))
    .sort((a, b) => a.SC.localeCompare(b.SC));

  const workbook = XLSX.utils.book_new();
  const scopes = XLSX.utils.json_to_sheet(scopeRows, {
    header: ['SC', 'Regions', 'Total', 'Not Started', 'In Progress', 'Blocked', 'Completed'],
  });
  const summary = XLSX.utils.json_to_sheet(summaryRows, {
    header: [
      'Site ID',
      'Region',
      'SC',
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
      'SC',
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
  setColumnWidths(summary, [18, 14, 16, 14, 16, 16, 12, 34, 34, 14, 24, 24]);
  setColumnWidths(details, [18, 14, 16, 16, 12, 34, 18, 22, 45, 24, 24]);
  setColumnWidths(scopes, [20, 30, 12, 14, 14, 12, 12]);
  scopes['!autofilter'] = { ref: scopes['!ref'] ?? 'A1:G1' };
  summary['!autofilter'] = { ref: summary['!ref'] ?? 'A1:L1' };
  details['!autofilter'] = { ref: details['!ref'] ?? 'A1:K1' };
  XLSX.utils.book_append_sheet(workbook, scopes, 'Service Centers');
  XLSX.utils.book_append_sheet(workbook, summary, 'Current Status');
  XLSX.utils.book_append_sheet(workbook, details, 'Step Details');

  const date = new Date().toISOString().slice(0, 10);
  return {
    buffer: XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer', compression: true }) as Buffer,
    filename: `site-status-${date}.xlsx`,
    siteCount: workflows.length,
  };
}
