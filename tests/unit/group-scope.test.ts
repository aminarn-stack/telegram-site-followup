import { describe, expect, it } from 'vitest';
import { resolveGroupServiceCenters } from '../../src/bot.js';

describe('Telegram group scopes', () => {
  it('limits a contributor to the intersection of user and group SCs', () => {
    expect(resolveGroupServiceCenters('CONTRIBUTOR', ['SC-A', 'SC-B'], ['SC-B', 'SC-C'])).toEqual([
      'SC-B',
    ]);
  });

  it('lets an administrator see all in private and only the group scope in a group', () => {
    expect(resolveGroupServiceCenters('ADMIN', [], null)).toBeNull();
    expect(resolveGroupServiceCenters('ADMIN', [], ['SC-A'])).toEqual(['SC-A']);
  });

  it('blocks an unassigned group instead of exposing all SCs', () => {
    expect(resolveGroupServiceCenters('VIEWER', ['SC-A'], [])).toEqual([]);
    expect(resolveGroupServiceCenters('ADMIN', [], [])).toEqual([]);
  });
});
