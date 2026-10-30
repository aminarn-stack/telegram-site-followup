import type { SectorAddition, SiteType } from './workflow.js';

export const REQUIRED_COLUMNS = [
  'Site ID',
  'Region',
  'SC',
  'Shared Site Or Normal Site',
  'Add sector included or Not',
] as const;

export interface RawImportRow {
  rowNumber: number;
  values: Record<string, unknown>;
}

export interface ValidImportRow {
  rowNumber: number;
  siteIdText: string;
  region: string;
  serviceCenter: string;
  siteType: SiteType;
  sectorAddition: SectorAddition;
  errors: string[];
}

const normalize = (value: unknown) => String(value ?? '').trim();

export function parseSiteType(value: unknown): SiteType | null {
  const normalized = normalize(value)
    .toLowerCase()
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/\s+/g, ' ');
  if (['normal', 'normal site'].includes(normalized)) return 'NORMAL';
  if (['shared', 'shared site'].includes(normalized)) return 'SHARED';
  return null;
}

export function parseSector(value: unknown): SectorAddition | null {
  const normalized = normalize(value)
    .toLowerCase()
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/\s+/g, ' ');
  if (
    ['yes', 'included', 'add sector', 'with sector add', 'with sector addition'].includes(
      normalized,
    )
  )
    return 'YES';
  if (
    ['no', 'not', 'not included', 'without sector add', 'without sector addition'].includes(
      normalized,
    )
  )
    return 'NO';
  return null;
}

export function validateRows(rows: readonly RawImportRow[]): ValidImportRow[] {
  const seen = new Map<string, number>();
  return rows.map(({ rowNumber, values }) => {
    const siteIdText = normalize(values['Site ID']);
    const region = normalize(values.Region);
    const serviceCenter = normalize(values.SC);
    const siteType = parseSiteType(values['Shared Site Or Normal Site']);
    const sectorAddition = parseSector(values['Add sector included or Not']);
    const errors: string[] = [];
    if (!siteIdText) errors.push('Site ID is required.');
    if (!region) errors.push('Region is required.');
    if (!serviceCenter) errors.push('SC is required.');
    if (!siteType) errors.push('Site type must be Normal or Shared.');
    if (!sectorAddition) errors.push('Sector addition must be Yes or No.');
    if (siteIdText) {
      const first = seen.get(siteIdText.toLowerCase());
      if (first) errors.push(`Duplicate Site ID; first found on row ${first}.`);
      else seen.set(siteIdText.toLowerCase(), rowNumber);
    }
    return {
      rowNumber,
      siteIdText,
      region,
      serviceCenter,
      siteType: siteType ?? 'NORMAL',
      sectorAddition: sectorAddition ?? 'NO',
      errors,
    };
  });
}
