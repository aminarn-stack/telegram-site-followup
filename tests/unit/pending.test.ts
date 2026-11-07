import { describe, expect, it } from 'vitest';
import {
  formatPendingAge,
  pendingAge,
  stepOwner,
  summarizePending,
} from '../../src/domain/pending.js';

const now = new Date('2026-11-07T12:00:00Z');

function step(code: string, state: string, hours: number, estimated = false) {
  return {
    templateStep: { code },
    state,
    pendingSince: new Date(now.getTime() - hours * 3_600_000),
    pendingSinceEstimated: estimated,
  };
}

describe('step ownership and pending duration', () => {
  it('assigns the five MTNI steps by code and all remaining steps to Contractor', () => {
    expect(
      [
        'INSTALLATION_PLAN',
        'BP_ISSUANCE',
        'CORE_RECEIPT',
        'MATERIAL_DELIVERY',
        'SHARING_RESULT',
      ].map(stepOwner),
    ).toEqual(['MTNI', 'MTNI', 'MTNI', 'MTNI', 'MTNI']);
    expect(['CORE_REQUEST', 'SHARING_REQUEST', 'LICENSE_ISSUANCE'].map(stepOwner)).toEqual([
      'Contractor',
      'Contractor',
      'Contractor',
    ]);
  });

  it('uses the oldest open step for each side without adding parallel waits', () => {
    const summary = summarizePending(
      [
        step('MATERIAL_DELIVERY', 'ACTIONABLE', 30),
        step('CORE_RECEIPT', 'BLOCKED', 12, true),
        step('CORE_REQUEST', 'NEEDS_REVIEW', 4),
        step('BP_ISSUANCE', 'COMPLETED', 90),
        step('PERMISSION', 'NOT_APPLICABLE', 70),
        step('RAISING_CR', 'LOCKED', 50),
      ],
      now,
    );

    expect(summary.MTNI).toMatchObject({ minutes: 1800, estimated: true });
    expect(summary.Contractor).toMatchObject({ minutes: 240, estimated: false });
    expect(formatPendingAge(summary.MTNI!)).toBe('at least 1d 6h');
  });

  it('reports a pending step under a minute as zero minutes and ignores closed steps', () => {
    expect(pendingAge(step('MATERIAL_DELIVERY', 'ACTIONABLE', 1 / 120), now)?.minutes).toBe(0);
    expect(pendingAge(step('MATERIAL_DELIVERY', 'COMPLETED', 5), now)).toBeNull();
    expect(summarizePending([], now)).toEqual({ MTNI: null, Contractor: null });
  });
});
