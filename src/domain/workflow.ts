export type SiteType = 'NORMAL' | 'SHARED';
export type SectorAddition = 'YES' | 'NO';
export type WorkflowState =
  'LOCKED' | 'ACTIONABLE' | 'COMPLETED' | 'BLOCKED' | 'NOT_APPLICABLE' | 'NEEDS_REVIEW';
export type SiteStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';

export interface StepDefinition {
  code: string;
  order: number;
  label: string;
  prerequisiteCode: string | null;
  type: string;
  answers: readonly string[];
}

export interface TemplateDefinition {
  code: string;
  version: number;
  siteType: SiteType;
  sectorAddition: SectorAddition;
  steps: readonly StepDefinition[];
}

export interface StepSnapshot {
  code: string;
  answer: string | null;
  state: WorkflowState;
}

const initialAnswers = [
  'Done - Permission needed',
  'Done - Permission not needed',
  'Not Done',
] as const;
const permissionAnswers = ['Available', 'Not Available'] as const;
const doneAnswers = ['Done', 'Not Done'] as const;
const receivedAnswers = ['Received', 'Not Received'] as const;
const okAnswers = ['OK', 'NOK'] as const;
const submittedAnswers = ['Submitted', 'Not Submitted'] as const;
const deliveryAnswers = ['Delivered', 'Not Delivered'] as const;
const licenseRequiredAnswers = ['Yes', 'Requested - No'] as const;
const implementationAnswers = ['Done', 'Ongoing', 'Not Possible'] as const;

const step = (
  code: string,
  order: number,
  label: string,
  prerequisiteCode: string | null,
  type: string,
  answers: readonly string[],
): StepDefinition => ({ code, order, label, prerequisiteCode, type, answers });

const base = [
  step('INITIAL_ACCESS', 1, 'Initial access assessment', null, 'INITIAL_ACCESS', initialAnswers),
  step('PERMISSION', 2, 'Permission', 'INITIAL_ACCESS', 'PERMISSION', permissionAnswers),
  step('AVAILABLE_PORT', 3, 'Available port check', null, 'PORT_CHECK', okAnswers),
  step('PRE_TSS', 4, 'Pre-TSS', 'PERMISSION', 'STANDARD', doneAnswers),
  step('RND_SUBMISSION', 5, 'RND submission', 'PRE_TSS', 'STANDARD', doneAnswers),
  step(
    'INSTALLATION_PLAN',
    6,
    'Installation plan by RND',
    'RND_SUBMISSION',
    'RECEIPT',
    receivedAnswers,
  ),
  step('BP_REQUEST', 7, 'BP request', 'INSTALLATION_PLAN', 'STANDARD', doneAnswers),
  step('BP_ISSUANCE', 8, 'BP issuance by RMPS', 'BP_REQUEST', 'STANDARD', doneAnswers),
  step(
    'LICENSE_REQUIRED',
    9,
    'License required',
    'BP_ISSUANCE',
    'LICENSE_REQUIRED',
    licenseRequiredAnswers,
  ),
  step('LICENSE_ISSUANCE', 10, 'License issuance', 'LICENSE_REQUIRED', 'STANDARD', doneAnswers),
] as const;

export const WORKFLOW_TEMPLATES: readonly TemplateDefinition[] = [
  {
    code: 'NORMAL_NO_SECTOR',
    version: 1,
    siteType: 'NORMAL',
    sectorAddition: 'NO',
    steps: [
      ...base,
      step('CORE_REQUEST', 11, 'Core/SID/CGI/IP request', 'BP_ISSUANCE', 'STANDARD', doneAnswers),
      step('CORE_RECEIPT', 12, 'Core/SID/CGI/IP', 'CORE_REQUEST', 'RECEIPT', receivedAnswers),
      step('FPA_CHECK', 13, 'FPA check', 'BP_ISSUANCE', 'FPA_CHECK', okAnswers),
      step('MR_REQUEST', 14, 'MR request', 'FPA_CHECK', 'MR_REQUEST', submittedAnswers),
      step('MATERIAL_DELIVERY', 15, 'Material delivery', 'MR_REQUEST', 'DELIVERY', deliveryAnswers),
      step(
        'IMPLEMENTATION_ACCESS',
        16,
        'Implementation access arrangement',
        'MATERIAL_DELIVERY',
        'STANDARD',
        doneAnswers,
      ),
      step('RAISING_CR', 17, 'Raising CR', 'IMPLEMENTATION_ACCESS', 'STANDARD', doneAnswers),
      step(
        'SITE_IMPLEMENTATION',
        18,
        'Site Implementation',
        'RAISING_CR',
        'SITE_IMPLEMENTATION',
        implementationAnswers,
      ),
    ],
  },
  {
    code: 'SHARED_NO_SECTOR',
    version: 1,
    siteType: 'SHARED',
    sectorAddition: 'NO',
    steps: [
      ...base,
      step(
        'SHARING_REQUEST',
        11,
        'Sharing request submission',
        'BP_ISSUANCE',
        'STANDARD',
        doneAnswers,
      ),
      step('SHARING_RESULT', 12, 'Sharing result', 'SHARING_REQUEST', 'SHARING_RESULT', [
        'Approved',
        'Rejected',
      ]),
      step(
        'CORE_REQUEST',
        13,
        'Core/SID/CGI/IP request',
        'SHARING_RESULT',
        'STANDARD',
        doneAnswers,
      ),
      step('CORE_RECEIPT', 14, 'Core/SID/CGI/IP', 'CORE_REQUEST', 'RECEIPT', receivedAnswers),
      step('MR_REQUEST', 15, 'MR request', 'SHARING_RESULT', 'MR_REQUEST', submittedAnswers),
      step('MATERIAL_DELIVERY', 16, 'Material delivery', 'MR_REQUEST', 'DELIVERY', deliveryAnswers),
      step(
        'IMPLEMENTATION_ACCESS',
        17,
        'Implementation access arrangement',
        'MATERIAL_DELIVERY',
        'STANDARD',
        doneAnswers,
      ),
      step('RAISING_CR', 18, 'Raising CR', 'IMPLEMENTATION_ACCESS', 'STANDARD', doneAnswers),
      step(
        'SITE_IMPLEMENTATION',
        19,
        'Site Implementation',
        'RAISING_CR',
        'SITE_IMPLEMENTATION',
        implementationAnswers,
      ),
    ],
  },
  {
    code: 'NORMAL_SECTOR_ADD',
    version: 1,
    siteType: 'NORMAL',
    sectorAddition: 'YES',
    steps: [
      ...base,
      step(
        'CIVIL_MATERIAL',
        11,
        'Arranging for civil material',
        'BP_ISSUANCE',
        'STANDARD',
        doneAnswers,
      ),
      step('CORE_REQUEST', 12, 'Core/SID/CGI/IP request', 'BP_ISSUANCE', 'STANDARD', doneAnswers),
      step('CORE_RECEIPT', 13, 'Core/SID/CGI/IP', 'CORE_REQUEST', 'RECEIPT', receivedAnswers),
      step('FPA_CHECK', 14, 'FPA check', 'BP_ISSUANCE', 'FPA_CHECK', okAnswers),
      step('MR_REQUEST', 15, 'MR request', 'CIVIL_MATERIAL', 'MR_REQUEST', submittedAnswers),
      step('MATERIAL_DELIVERY', 16, 'Material delivery', 'MR_REQUEST', 'DELIVERY', deliveryAnswers),
      step(
        'IMPLEMENTATION_ACCESS',
        17,
        'Implementation access arrangement',
        'MATERIAL_DELIVERY',
        'STANDARD',
        doneAnswers,
      ),
      step('RAISING_CR', 18, 'Raising CR', 'IMPLEMENTATION_ACCESS', 'STANDARD', doneAnswers),
      step(
        'SITE_IMPLEMENTATION',
        19,
        'Site Implementation',
        'RAISING_CR',
        'SITE_IMPLEMENTATION',
        implementationAnswers,
      ),
    ],
  },
  {
    code: 'SHARED_SECTOR_ADD',
    version: 1,
    siteType: 'SHARED',
    sectorAddition: 'YES',
    steps: [
      ...base,
      step(
        'CIVIL_MATERIAL',
        11,
        'Arranging for civil material',
        'BP_ISSUANCE',
        'STANDARD',
        doneAnswers,
      ),
      step(
        'SHARING_REQUEST',
        12,
        'Sharing request submission',
        'BP_ISSUANCE',
        'STANDARD',
        doneAnswers,
      ),
      step('SHARING_RESULT', 13, 'Sharing result', 'SHARING_REQUEST', 'SHARING_RESULT', [
        'Approved',
        'Rejected',
      ]),
      step(
        'CORE_REQUEST',
        14,
        'Core/SID/CGI/IP request',
        'SHARING_REQUEST',
        'STANDARD',
        doneAnswers,
      ),
      step('CORE_RECEIPT', 15, 'Core/SID/CGI/IP', 'CORE_REQUEST', 'RECEIPT', receivedAnswers),
      step('MR_REQUEST', 16, 'MR request', 'SHARING_RESULT', 'MR_REQUEST', submittedAnswers),
      step('MATERIAL_DELIVERY', 17, 'Material delivery', 'MR_REQUEST', 'DELIVERY', deliveryAnswers),
      step(
        'IMPLEMENTATION_ACCESS',
        18,
        'Implementation access arrangement',
        'MATERIAL_DELIVERY',
        'STANDARD',
        doneAnswers,
      ),
      step('RAISING_CR', 19, 'Raising CR', 'IMPLEMENTATION_ACCESS', 'STANDARD', doneAnswers),
      step(
        'SITE_IMPLEMENTATION',
        20,
        'Site Implementation',
        'RAISING_CR',
        'SITE_IMPLEMENTATION',
        implementationAnswers,
      ),
    ],
  },
] as const;

export function templateFor(siteType: SiteType, sector: SectorAddition): TemplateDefinition {
  const template = WORKFLOW_TEMPLATES.find(
    (item) => item.siteType === siteType && item.sectorAddition === sector,
  );
  if (!template) throw new Error(`No workflow template for ${siteType}/${sector}`);
  return template;
}

export function isPositive(stepType: string, answer: string): boolean {
  const negatives: Record<string, readonly string[]> = {
    INITIAL_ACCESS: ['Not Done'],
    PERMISSION: ['Not Available'],
    PORT_CHECK: ['NOK'],
    FPA_CHECK: ['NOK'],
    STANDARD: ['Not Done'],
    RECEIPT: ['Not Received'],
    SHARING_RESULT: ['Rejected'],
    MR_REQUEST: ['Not Submitted'],
    DELIVERY: ['Not Delivered'],
    SITE_IMPLEMENTATION: ['Not Possible'],
  };
  return !negatives[stepType]?.includes(answer);
}

export function initialStepStates(template: TemplateDefinition): StepSnapshot[] {
  return template.steps.map((definition) => ({
    code: definition.code,
    answer: null,
    state: definition.prerequisiteCode ? 'LOCKED' : 'ACTIONABLE',
  }));
}

export function descendantsOf(template: TemplateDefinition, code: string): Set<string> {
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of template.steps) {
      if (
        item.prerequisiteCode &&
        (item.prerequisiteCode === code || descendants.has(item.prerequisiteCode)) &&
        !descendants.has(item.code)
      ) {
        descendants.add(item.code);
        changed = true;
      }
    }
  }
  return descendants;
}

export function recalculate(
  template: TemplateDefinition,
  snapshots: readonly StepSnapshot[],
): { steps: StepSnapshot[]; siteStatus: SiteStatus } {
  const byCode = new Map(snapshots.map((item) => [item.code, { ...item }]));
  const initial = byCode.get('INITIAL_ACCESS');
  const permission = byCode.get('PERMISSION');
  if (
    permission &&
    ['Done - Permission not needed', 'Done-Permission no needed'].includes(initial?.answer ?? '')
  ) {
    permission.answer = null;
    permission.state = 'NOT_APPLICABLE';
  } else if (permission?.state === 'NOT_APPLICABLE') {
    permission.state = 'LOCKED';
  }

  const licenseRequired = byCode.get('LICENSE_REQUIRED');
  const licenseIssuance = byCode.get('LICENSE_ISSUANCE');
  if (licenseIssuance && licenseRequired?.answer === 'Requested - No') {
    licenseIssuance.answer = null;
    licenseIssuance.state = 'NOT_APPLICABLE';
  } else if (licenseIssuance?.state === 'NOT_APPLICABLE') {
    licenseIssuance.state = 'LOCKED';
  }

  for (const definition of template.steps) {
    const current = byCode.get(definition.code);
    if (!current) throw new Error(`Missing site step ${definition.code}`);
    if (current.state === 'NEEDS_REVIEW') continue;
    if (
      ['PERMISSION', 'LICENSE_ISSUANCE'].includes(definition.code) &&
      current.state === 'NOT_APPLICABLE'
    )
      continue;

    const prerequisite = definition.prerequisiteCode
      ? byCode.get(definition.prerequisiteCode)
      : null;
    const prerequisiteSatisfied =
      definition.code === 'SITE_IMPLEMENTATION'
        ? template.steps
            .filter(
              (item) =>
                !['SITE_IMPLEMENTATION', 'LICENSE_REQUIRED', 'LICENSE_ISSUANCE'].includes(
                  item.code,
                ),
            )
            .every((item) => {
              const step = byCode.get(item.code);
              return step?.state === 'COMPLETED' || step?.state === 'NOT_APPLICABLE';
            })
        : !prerequisite ||
          prerequisite.state === 'COMPLETED' ||
          prerequisite.state === 'NOT_APPLICABLE';

    if (!prerequisiteSatisfied) {
      current.state = 'LOCKED';
      continue;
    }
    if (!current.answer) {
      current.state = 'ACTIONABLE';
      continue;
    }
    if (definition.type === 'SITE_IMPLEMENTATION' && current.answer === 'Ongoing') {
      current.state = 'ACTIONABLE';
      continue;
    }
    current.state = isPositive(definition.type, current.answer) ? 'COMPLETED' : 'BLOCKED';
  }

  const steps = template.steps.map((item) => byCode.get(item.code)!);
  const hasBlocked = steps.some(
    (item) => item.state === 'BLOCKED' || item.state === 'NEEDS_REVIEW',
  );
  const hasProgress = steps.some(
    (item) => item.state === 'COMPLETED' || item.state === 'NOT_APPLICABLE',
  );
  const allComplete = steps.every(
    (item) => item.state === 'COMPLETED' || item.state === 'NOT_APPLICABLE',
  );
  const siteStatus: SiteStatus = hasBlocked
    ? 'BLOCKED'
    : allComplete
      ? 'COMPLETED'
      : hasProgress
        ? 'IN_PROGRESS'
        : 'NOT_STARTED';
  return { steps, siteStatus };
}
