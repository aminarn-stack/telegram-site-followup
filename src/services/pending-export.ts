import * as XLSX from 'xlsx';
import { prisma } from '../db.js';
import {
  PENDING_STATES,
  pendingAge,
  stepOwner,
  summarizePending,
  type PendingAge,
  type PendingStep,
} from '../domain/pending.js';
import type { ExportActor } from './status-export.js';

export const pendingSiteHeaders = [
  'MTNI Pending Hours',
  'MTNI Age Basis',
  'Contractor Pending Hours',
  'Contractor Age Basis',
] as const;

export const pendingStepHeaders = ['Pending Since (UTC)', 'Pending Hours', 'Age Basis'] as const;

function pendingHours(age: PendingAge | null) {
  return age ? Number((age.minutes / 60).toFixed(2)) : '';
}

function ageBasis(age: PendingAge | null) {
  return age ? (age.estimated ? 'Lower bound' : 'Tracked') : '';
}

export function pendingSiteColumns(steps: readonly PendingStep[], now: Date) {
  const pending = summarizePending(steps, now);
  return {
    'MTNI Pending Hours': pendingHours(pending.MTNI),
    'MTNI Age Basis': ageBasis(pending.MTNI),
    'Contractor Pending Hours': pendingHours(pending.Contractor),
    'Contractor Age Basis': ageBasis(pending.Contractor),
  };
}

export function pendingStepColumns(step: PendingStep, now: Date) {
  const age = pendingAge(step, now);
  return {
    'Pending Since (UTC)': age?.since ?? '',
    'Pending Hours': pendingHours(age),
    'Age Basis': ageBasis(age),
  };
}

export async function createPendingExport(actor: ExportActor) {
  const workflows = await prisma.siteWorkflow.findMany({
    where: {
      active: true,
      steps: { some: { state: { in: [...PENDING_STATES] } } },
      ...(actor.role === 'ADMIN'
        ? {}
        : { site: { serviceCenter: { code: { in: actor.serviceCenters } } } }),
    },
    select: {
      site: {
        select: {
          siteIdText: true,
          region: { select: { code: true } },
          serviceCenter: { select: { code: true } },
        },
      },
      steps: {
        where: { state: { in: [...PENDING_STATES] } },
        select: {
          state: true,
          answer: true,
          pendingSince: true,
          pendingSinceEstimated: true,
          templateStep: { select: { code: true, label: true } },
        },
      },
    },
  });

  const now = new Date();
  const ownerSites = { MTNI: new Set<string>(), Contractor: new Set<string>() };
  const rows = workflows
    .flatMap(({ site, steps }) =>
      steps.map((step) => {
        const owner = stepOwner(step.templateStep.code);
        ownerSites[owner].add(site.siteIdText);
        return {
          Owner: owner,
          SC: site.serviceCenter.code,
          Region: site.region.code,
          'Site ID': site.siteIdText,
          Step: step.templateStep.label,
          Status: step.state.replaceAll('_', ' '),
          Answer: step.answer ?? '',
          ...pendingStepColumns(step, now),
        };
      }),
    )
    .sort(
      (a, b) =>
        a.Owner.localeCompare(b.Owner) ||
        a['Pending Since (UTC)'].localeCompare(b['Pending Since (UTC)']) ||
        a['Site ID'].localeCompare(b['Site ID']),
    );

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: ['Owner', 'SC', 'Region', 'Site ID', 'Step', 'Status', 'Answer', ...pendingStepHeaders],
  });
  sheet['!cols'] = [16, 16, 14, 18, 34, 18, 24, 28, 16, 16].map((wch) => ({ wch }));
  sheet['!autofilter'] = { ref: sheet['!ref'] ?? 'A1:J1' };
  XLSX.utils.book_append_sheet(workbook, sheet, 'Pending Steps');

  return {
    buffer: XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer', compression: true }) as Buffer,
    filename: `site-pending-${now.toISOString().slice(0, 10)}.xlsx`,
    ownerCounts: { MTNI: ownerSites.MTNI.size, Contractor: ownerSites.Contractor.size },
  };
}
