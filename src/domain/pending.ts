export const PENDING_STATES = ['ACTIONABLE', 'BLOCKED', 'NEEDS_REVIEW'] as const;
export const STEP_OWNERS = ['MTNI', 'Contractor'] as const;
export type StepOwner = (typeof STEP_OWNERS)[number];

const mtniSteps = new Set([
  'INSTALLATION_PLAN',
  'BP_ISSUANCE',
  'CORE_RECEIPT',
  'MATERIAL_DELIVERY',
  'SHARING_RESULT',
]);

export function stepOwner(code: string): StepOwner {
  return mtniSteps.has(code) ? 'MTNI' : 'Contractor';
}

export function isPendingState(state: string) {
  return PENDING_STATES.some((pending) => pending === state);
}

export interface PendingStep {
  state: string;
  pendingSince: Date | null;
  pendingSinceEstimated: boolean;
  templateStep: { code: string };
}

export interface PendingAge {
  since: string;
  minutes: number;
  estimated: boolean;
}

export type PendingByOwner = Record<StepOwner, PendingAge | null>;

export function pendingAge(step: PendingStep, now: Date): PendingAge | null {
  if (!step.pendingSince || !isPendingState(step.state)) return null;
  return {
    since: step.pendingSince.toISOString(),
    minutes: Math.max(0, Math.floor((now.getTime() - step.pendingSince.getTime()) / 60_000)),
    estimated: step.pendingSinceEstimated,
  };
}

export function summarizePending(steps: readonly PendingStep[], now: Date): PendingByOwner {
  const result: PendingByOwner = { MTNI: null, Contractor: null };
  for (const step of steps) {
    const age = pendingAge(step, now);
    if (!age) continue;
    const owner = stepOwner(step.templateStep.code);
    const previous = result[owner];
    const oldest = previous && previous.since <= age.since ? previous : age;
    result[owner] = { ...oldest, estimated: age.estimated || (previous?.estimated ?? false) };
  }
  return result;
}

export function formatPendingAge({ minutes, estimated }: PendingAge): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const duration = days
    ? `${days}d ${hours}h`
    : hours
      ? `${hours}h ${minutes % 60}m`
      : `${minutes}m`;
  return estimated ? `at least ${duration}` : duration;
}
