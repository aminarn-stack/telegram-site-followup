import { describe, expect, it } from 'vitest';
import {
  deriveFlowStepSummary,
  type FlowStepSnapshot,
} from '../../src/services/site-flow-export.js';

function step(
  code: string,
  label: string,
  order: number,
  state: string,
  prerequisiteCode: string | null,
  answer: string | null = null,
): FlowStepSnapshot {
  return {
    state,
    answer,
    updatedAt: new Date(`2026-10-${String(order).padStart(2, '0')}T00:00:00Z`),
    templateStep: { code, label, displayOrder: order, prerequisiteCode },
  };
}

describe('site flow export', () => {
  it('shows parallel current steps and their directly dependent next steps', () => {
    const result = deriveFlowStepSummary([
      step('ACCESS', 'Access', 1, 'ACTIONABLE', null),
      step('PORT', 'Port check', 2, 'BLOCKED', null, 'NOK'),
      step('PERMISSION', 'Permission', 3, 'LOCKED', 'ACCESS'),
      step('PRE_TSS', 'Pre-TSS', 4, 'LOCKED', 'PERMISSION'),
    ]);

    expect(result.currentSteps).toBe('Access, Port check');
    expect(result.currentStatuses).toBe('ACTIONABLE, BLOCKED');
    expect(result.currentAnswers).toBe('NOK');
    expect(result.nextSteps).toBe('Permission');
  });

  it('marks completed workflows without a next step', () => {
    const result = deriveFlowStepSummary([
      step('ACCESS', 'Access', 1, 'COMPLETED', null, 'Done'),
      step('IMPLEMENTATION', 'Site Implementation', 2, 'COMPLETED', 'ACCESS', 'Done'),
    ]);

    expect(result.currentSteps).toBe('Completed');
    expect(result.currentStatuses).toBe('Completed');
    expect(result.nextSteps).toBe('');
    expect(result.completedSteps).toBe(2);
  });
});
