import { describe, expect, it } from 'vitest';
import {
  initialStepStates,
  recalculate,
  templateFor,
  WORKFLOW_TEMPLATES,
  type StepSnapshot,
  type TemplateDefinition,
} from '../../src/domain/workflow.js';

function answer(template: TemplateDefinition, steps: StepSnapshot[], code: string, value: string) {
  const target = steps.find((item) => item.code === code)!;
  target.answer = value;
  return recalculate(template, steps).steps;
}

describe('seeded workflow templates', () => {
  it('routes all four scenarios to the exact documented step counts', () => {
    expect(templateFor('NORMAL', 'NO').steps).toHaveLength(16);
    expect(templateFor('SHARED', 'NO').steps).toHaveLength(17);
    expect(templateFor('NORMAL', 'YES').steps).toHaveLength(17);
    expect(templateFor('SHARED', 'YES').steps).toHaveLength(18);
    expect(WORKFLOW_TEMPLATES.map((item) => item.code)).toEqual([
      'NORMAL_NO_SECTOR',
      'SHARED_NO_SECTOR',
      'NORMAL_SECTOR_ADD',
      'SHARED_SECTOR_ADD',
    ]);
  });

  it('marks Permission N/A and unlocks Pre-TSS when permission is not needed (AT-04)', () => {
    const template = templateFor('NORMAL', 'NO');
    const steps = answer(
      template,
      initialStepStates(template),
      'INITIAL_ACCESS',
      'Done-Permission no needed',
    );
    expect(steps.find((item) => item.code === 'PERMISSION')).toMatchObject({
      answer: null,
      state: 'NOT_APPLICABLE',
    });
    expect(steps.find((item) => item.code === 'PRE_TSS')?.state).toBe('ACTIONABLE');
  });

  it('makes Permission actionable and leaves Pre-TSS locked when permission is needed (AT-05)', () => {
    const template = templateFor('NORMAL', 'NO');
    const steps = answer(
      template,
      initialStepStates(template),
      'INITIAL_ACCESS',
      'Done-Permission needed',
    );
    expect(steps.find((item) => item.code === 'PERMISSION')?.state).toBe('ACTIONABLE');
    expect(steps.find((item) => item.code === 'PRE_TSS')?.state).toBe('LOCKED');
  });

  it('blocks Permission descendants but leaves the port branch independent (AT-06 and AT-08)', () => {
    const template = templateFor('NORMAL', 'NO');
    let steps = answer(
      template,
      initialStepStates(template),
      'INITIAL_ACCESS',
      'Done-Permission needed',
    );
    steps = answer(template, steps, 'PERMISSION', 'Not Available');
    const calculated = recalculate(template, steps);
    expect(calculated.siteStatus).toBe('BLOCKED');
    expect(calculated.steps.find((item) => item.code === 'PERMISSION')?.state).toBe('BLOCKED');
    expect(calculated.steps.find((item) => item.code === 'PRE_TSS')?.state).toBe('LOCKED');
    expect(calculated.steps.find((item) => item.code === 'AVAILABLE_PORT')?.state).toBe(
      'ACTIONABLE',
    );
  });

  it('recovers a blocked permission branch after Available (AT-07)', () => {
    const template = templateFor('NORMAL', 'NO');
    let steps = answer(
      template,
      initialStepStates(template),
      'INITIAL_ACCESS',
      'Done-Permission needed',
    );
    steps = answer(template, steps, 'PERMISSION', 'Not Available');
    steps = answer(template, steps, 'PERMISSION', 'Available');
    expect(steps.find((item) => item.code === 'PERMISSION')?.state).toBe('COMPLETED');
    expect(steps.find((item) => item.code === 'PRE_TSS')?.state).toBe('ACTIONABLE');
  });

  it('unlocks both shared-sector branches after sharing request and keeps core independent of rejection (AT-09/10)', () => {
    const template = templateFor('SHARED', 'YES');
    const snapshots = initialStepStates(template).map((item) => ({ ...item }));
    const completedAnswers: Record<string, string> = {
      INITIAL_ACCESS: 'Done-Permission no needed',
      PRE_TSS: 'Done',
      RND_SUBMISSION: 'Done',
      INSTALLATION_PLAN: 'Received',
      BP_REQUEST: 'Done',
      BP_ISSUANCE: 'Done',
      SHARING_REQUEST: 'Done',
    };
    for (const item of snapshots) {
      item.answer = completedAnswers[item.code] ?? null;
    }
    let steps = recalculate(template, snapshots).steps;
    expect(steps.find((item) => item.code === 'SHARING_RESULT')?.state).toBe('ACTIONABLE');
    expect(steps.find((item) => item.code === 'CORE_REQUEST')?.state).toBe('ACTIONABLE');
    steps = answer(template, steps, 'SHARING_RESULT', 'Rejected');
    expect(steps.find((item) => item.code === 'MR_REQUEST')?.state).toBe('LOCKED');
    expect(steps.find((item) => item.code === 'CORE_REQUEST')?.state).toBe('ACTIONABLE');
  });

  it('completes only when every applicable step is completed or N/A (AT-11)', () => {
    const template = templateFor('NORMAL', 'NO');
    const snapshots = initialStepStates(template).map((item) => {
      const definition = template.steps.find((step) => step.code === item.code)!;
      const positive = definition.answers.find(
        (candidate) =>
          ![
            'Not Done',
            'Not Available',
            'NOK',
            'Not Received',
            'Rejected',
            'Not submitted',
            'Not delivered',
          ].includes(candidate),
      );
      return {
        ...item,
        answer:
          definition.code === 'INITIAL_ACCESS'
            ? 'Done-Permission no needed'
            : definition.code === 'PERMISSION'
              ? null
              : (positive ?? null),
      };
    });
    expect(recalculate(template, snapshots).siteStatus).toBe('COMPLETED');
  });

  it('keeps Site Implementation locked until every earlier branch is complete', () => {
    const template = templateFor('NORMAL', 'NO');
    const steps = initialStepStates(template);
    const implementation = steps.find((item) => item.code === 'SITE_IMPLEMENTATION');
    expect(implementation?.state).toBe('LOCKED');

    const almostComplete = steps.map((item) => {
      const definition = template.steps.find((candidate) => candidate.code === item.code)!;
      const answer = definition.answers.find(
        (candidate) =>
          ![
            'Not Done',
            'Not Available',
            'NOK',
            'Not Received',
            'Not submitted',
            'Not delivered',
          ].includes(candidate),
      );
      return {
        ...item,
        answer:
          item.code === 'INITIAL_ACCESS'
            ? 'Done-Permission no needed'
            : item.code === 'PERMISSION' || item.code === 'SITE_IMPLEMENTATION'
              ? null
              : (answer ?? null),
      };
    });
    const calculated = recalculate(template, almostComplete);
    expect(calculated.steps.find((item) => item.code === 'SITE_IMPLEMENTATION')?.state).toBe(
      'ACTIONABLE',
    );
    expect(calculated.siteStatus).toBe('IN_PROGRESS');
  });

  it('uses the final implementation outcome to complete, continue, or block the site', () => {
    const template = templateFor('NORMAL', 'NO');
    const ready = initialStepStates(template).map((item) => {
      const definition = template.steps.find((candidate) => candidate.code === item.code)!;
      const positive = definition.answers.find(
        (candidate) =>
          ![
            'Not Done',
            'Not Available',
            'NOK',
            'Not Received',
            'Rejected',
            'Not submitted',
            'Not delivered',
            'Not Possible',
            'Ongoing',
          ].includes(candidate),
      );
      return {
        ...item,
        answer:
          item.code === 'INITIAL_ACCESS'
            ? 'Done-Permission no needed'
            : item.code === 'PERMISSION'
              ? null
              : (positive ?? null),
      };
    });
    const done = recalculate(template, ready);
    expect(done.siteStatus).toBe('COMPLETED');

    const implementation = ready.find((item) => item.code === 'SITE_IMPLEMENTATION')!;
    implementation.answer = 'Ongoing';
    const ongoing = recalculate(template, ready);
    expect(ongoing.siteStatus).toBe('IN_PROGRESS');
    expect(ongoing.steps.find((item) => item.code === 'SITE_IMPLEMENTATION')?.state).toBe(
      'ACTIONABLE',
    );

    implementation.answer = 'Not Possible';
    const blocked = recalculate(template, ready);
    expect(blocked.siteStatus).toBe('BLOCKED');
    expect(blocked.steps.find((item) => item.code === 'SITE_IMPLEMENTATION')?.state).toBe(
      'BLOCKED',
    );
  });
});
