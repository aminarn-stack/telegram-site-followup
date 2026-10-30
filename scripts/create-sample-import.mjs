import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outputDir = new URL('../samples/', import.meta.url);
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const sheet = workbook.worksheets.add('Weekly Import');
sheet.showGridLines = false;
sheet.getRange('A1:E5').values = [
  ['Site ID', 'Region', 'SC', 'Shared Site Or Normal Site', 'Add sector included or Not'],
  ['001001', 'North', 'SC-A', 'Normal', 'No'],
  ['001002', 'North', 'SC-A', 'Shared', 'No'],
  ['001003', 'South', 'SC-B', 'Normal', 'Yes'],
  ['001004', 'South', 'SC-B', 'Shared', 'Yes'],
];
sheet.getRange('A1:E1').format = {
  fill: '#12344D',
  font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' },
  horizontalAlignment: 'center',
  verticalAlignment: 'center',
  wrapText: true,
  borders: { preset: 'all', style: 'thin', color: '#D9D9D9' },
};
sheet.getRange('A2:E41').format = {
  font: { name: 'Arial', size: 10, color: '#172B3A' },
  verticalAlignment: 'center',
};
sheet.getRange('A2:A41').format.numberFormat = '@';
sheet.getRange('A1:E41').format.borders = { preset: 'all', style: 'thin', color: '#D9D9D9' };
sheet.getRange('A1:A41').format.columnWidth = 18;
sheet.getRange('B1:B41').format.columnWidth = 18;
sheet.getRange('C1:C41').format.columnWidth = 18;
sheet.getRange('D1:D41').format.columnWidth = 30;
sheet.getRange('E1:E41').format.columnWidth = 28;
sheet.getRange('A1:E1').format.rowHeight = 34;
sheet.getRange('D2:D41').dataValidation = { rule: { type: 'list', values: ['Normal', 'Shared'] } };
sheet.getRange('E2:E41').dataValidation = { rule: { type: 'list', values: ['Yes', 'No'] } };
sheet.freezePanes.freezeRows(1);
const table = sheet.tables.add('A1:E41', true, 'WeeklyImportTable');
table.style = 'TableStyleMedium2';
table.showFilterButton = true;

workbook.recalculate();
const check = await workbook.inspect({
  kind: 'table',
  range: 'Weekly Import!A1:E5',
  include: 'values,formulas',
  tableMaxRows: 5,
  tableMaxCols: 5,
});
console.log(check.ndjson);
const errors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
  options: { useRegex: true, maxResults: 50 },
  summary: 'final formula error scan',
});
console.log(errors.ndjson);
const preview = await workbook.render({
  sheetName: 'Weekly Import',
  range: 'A1:E8',
  scale: 2,
  format: 'png',
});
await fs.writeFile(
  new URL('../.tmp-sample-import-preview.png', import.meta.url),
  new Uint8Array(await preview.arrayBuffer()),
);
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save('samples/weekly-import-sample.xlsx.bin');
console.log(
  'Generated XLSX package at samples/weekly-import-sample.xlsx.bin. Rename it to .xlsx outside restricted environments.',
);
