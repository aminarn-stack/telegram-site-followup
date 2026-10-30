import { describe, expect, it } from 'vitest';
import { parseSector, parseSiteType, validateRows } from '../../src/domain/import.js';

const valid = (siteId = '001001') => ({
  'Site ID': siteId,
  Region: ' North ',
  SC: ' SC-01 ',
  'Shared Site Or Normal Site': 'normal site',
  'Add sector included or Not': 'Not Included',
});

describe('weekly import validation', () => {
  it('trims and maps configured values case-insensitively', () => {
    expect(parseSiteType(' SHARED Site ')).toBe('SHARED');
    expect(parseSector('YES')).toBe('YES');
    const [row] = validateRows([{ rowNumber: 2, values: valid() }]);
    expect(row).toMatchObject({
      siteIdText: '001001',
      region: 'North',
      serviceCenter: 'SC-01',
      siteType: 'NORMAL',
      sectorAddition: 'NO',
      errors: [],
    });
  });

  it('preserves leading zeroes in Site IDs (AT-03)', () => {
    expect(validateRows([{ rowNumber: 2, values: valid('00017') }])[0]?.siteIdText).toBe('00017');
  });

  it('reports blanks, invalid classifications, and duplicates with source rows (AT-02)', () => {
    const rows = validateRows([
      { rowNumber: 2, values: valid('A-1') },
      {
        rowNumber: 3,
        values: {
          ...valid('a-1'),
          Region: '',
          SC: '',
          'Shared Site Or Normal Site': 'Partner',
          'Add sector included or Not': 'Maybe',
        },
      },
    ]);
    expect(rows[1]?.errors).toEqual(
      expect.arrayContaining([
        'Region is required.',
        'SC is required.',
        'Site type must be Normal or Shared.',
        'Sector addition must be Yes or No.',
        'Duplicate Site ID; first found on row 2.',
      ]),
    );
  });
});
