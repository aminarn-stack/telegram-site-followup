import { describe, expect, it } from 'vitest';
import { summarizeReminderWorkflows } from '../../src/services/reminder.js';

describe('reminder summary', () => {
  it('counts actionable not-started and in-progress sites while excluding blocked overlap', () => {
    const result = summarizeReminderWorkflows([
      { status: 'NOT_STARTED', steps: [{ state: 'ACTIONABLE' }] },
      { status: 'IN_PROGRESS', steps: [{ state: 'COMPLETED' }, { state: 'ACTIONABLE' }] },
      { status: 'IN_PROGRESS', steps: [{ state: 'LOCKED' }] },
      { status: 'BLOCKED', steps: [{ state: 'BLOCKED' }, { state: 'ACTIONABLE' }] },
      { status: 'COMPLETED', steps: [{ state: 'COMPLETED' }] },
    ]);

    expect(result).toEqual({ actionable: 2, blocked: 1 });
  });
});
