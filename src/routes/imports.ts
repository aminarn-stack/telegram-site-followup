import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Prisma, Role } from '@prisma/client';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { prisma } from '../db.js';
import type { Config } from '../config.js';
import { REQUIRED_COLUMNS, validateRows } from '../domain/import.js';
import { actorFrom, requireRole } from '../lib/auth.js';
import { notFound, validation } from '../lib/errors.js';
import { safeFilename, sha256 } from '../lib/security.js';

function parseWorkbook(buffer: Buffer, extension: string) {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    raw: false,
    dense: true,
    ...(extension === '.csv' ? { codepage: 65001 } : {}),
  });
  const first = workbook.SheetNames[0];
  if (!first) throw validation('The uploaded file has no worksheet.');
  const sheet = workbook.Sheets[first];
  if (!sheet) throw validation('The uploaded worksheet cannot be read.');
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  const headers =
    XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, range: 0, blankrows: false })[0] ?? [];
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.map(String).includes(column));
  if (missing.length) throw validation('Required columns are missing.', { missing });
  if (json.length < 1 || json.length > 40)
    throw validation('The import must contain 1 to 40 data rows.');
  return validateRows(json.map((values, index) => ({ rowNumber: index + 2, values })));
}

export async function importRoutes(app: FastifyInstance, config: Config) {
  app.post('/api/imports', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const query = z.object({ reportingWeek: z.coerce.date() }).parse(request.query);
    const upload = await request.file({ limits: { fileSize: config.MAX_IMPORT_BYTES, files: 1 } });
    if (!upload) throw validation('Select an Excel or CSV file.');
    const extension = extname(upload.filename).toLowerCase();
    if (!['.xlsx', '.csv'].includes(extension))
      throw validation('Only .xlsx and .csv imports are accepted.');
    const buffer = await upload.toBuffer();
    if (
      extension === '.xlsx' &&
      !buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    )
      throw validation('The uploaded file is not a valid XLSX package.');
    if (extension === '.csv' && buffer.subarray(0, 2).toString() === 'MZ')
      throw validation('Executable content is not accepted as a CSV import.');
    const rows = parseWorkbook(buffer, extension);
    const cleanName = safeFilename(upload.filename);
    const checksum = sha256(buffer);
    const storageKey = join('imports', `${checksum}-${cleanName}`);
    const destination = join(config.STORAGE_DIR, storageKey);
    await mkdir(join(config.STORAGE_DIR, 'imports'), { recursive: true });
    await writeFile(destination, buffer, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
    const acceptedRows = rows.filter((row) => row.errors.length === 0).length;
    const batch = await prisma.importBatch.create({
      data: {
        reportingWeek: query.reportingWeek,
        sourceFilename: cleanName,
        storageKey,
        checksum,
        uploaderId: actor.id,
        totalRows: rows.length,
        acceptedRows,
        rejectedRows: rows.length - acceptedRows,
        rows: {
          create: rows.map((row) => ({
            rowNumber: row.rowNumber,
            siteIdText: row.siteIdText || null,
            regionText: row.region || null,
            serviceCenterText: row.serviceCenter || null,
            siteTypeText: row.siteType,
            sectorText: row.sectorAddition,
            normalizedData: {
              siteIdText: row.siteIdText,
              region: row.region,
              serviceCenter: row.serviceCenter,
              siteType: row.siteType,
              sectorAddition: row.sectorAddition,
            },
            errors: row.errors,
            valid: row.errors.length === 0,
          })),
        },
      },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });
    return batch;
  });

  app.get('/api/imports', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    return prisma.importBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { uploader: { select: { firstName: true, lastName: true } } },
    });
  });

  app.get('/api/imports/:batchId', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const { batchId } = z.object({ batchId: z.string().uuid() }).parse(request.params);
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        rows: { orderBy: { rowNumber: 'asc' } },
        memberships: { include: { site: true } },
      },
    });
    if (!batch) throw notFound('Import batch not found.');
    return batch;
  });

  app.get('/api/imports/:batchId/errors.csv', async (request, reply) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const { batchId } = z.object({ batchId: z.string().uuid() }).parse(request.params);
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: { rows: true },
    });
    if (!batch) throw notFound('Import batch not found.');
    const csv = [
      'Row,Site ID,Errors',
      ...batch.rows
        .filter((row) => !row.valid)
        .map(
          (row) =>
            `${row.rowNumber},"${row.siteIdText ?? ''}","${(row.errors as string[]).join('; ').replaceAll('"', '""')}"`,
        ),
    ].join('\r\n');
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${batch.id}-errors.csv"`)
      .send(csv);
  });

  app.post('/api/imports/:batchId/commit', async (request) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const { batchId } = z.object({ batchId: z.string().uuid() }).parse(request.params);
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.importBatch.findUnique({
        where: { id: batchId },
        include: { rows: { orderBy: { rowNumber: 'asc' } } },
      });
      if (!batch) throw notFound('Import batch not found.');
      if (batch.status !== 'PREVIEW') throw validation('Only a preview batch can be committed.');
      if (batch.rejectedRows > 0)
        throw validation('Fix all rejected rows before committing this batch.');
      for (const row of batch.rows) {
        const data = row.normalizedData as {
          siteIdText: string;
          region: string;
          serviceCenter: string;
          siteType: 'NORMAL' | 'SHARED';
          sectorAddition: 'YES' | 'NO';
        };
        const region = await tx.region.upsert({
          where: { code: data.region },
          update: { active: true },
          create: { code: data.region },
        });
        const serviceCenter = await tx.serviceCenter.upsert({
          where: { code: data.serviceCenter },
          update: { active: true },
          create: { code: data.serviceCenter },
        });
        const existing = await tx.site.findUnique({
          where: { siteIdText: data.siteIdText },
          include: { workflows: { where: { active: true }, include: { steps: true } } },
        });
        const classificationChanged = Boolean(
          existing &&
          (existing.siteType !== data.siteType || existing.sectorAddition !== data.sectorAddition),
        );
        const hasProgress = Boolean(existing?.workflows[0]?.steps.some((item) => item.answer));
        const site = existing
          ? await tx.site.update({
              where: { id: existing.id },
              data:
                classificationChanged && !hasProgress
                  ? {
                      regionId: region.id,
                      serviceCenterId: serviceCenter.id,
                      siteType: data.siteType,
                      sectorAddition: data.sectorAddition,
                      active: true,
                    }
                  : { regionId: region.id, serviceCenterId: serviceCenter.id, active: true },
            })
          : await tx.site.create({
              data: {
                siteIdText: data.siteIdText,
                regionId: region.id,
                serviceCenterId: serviceCenter.id,
                siteType: data.siteType,
                sectorAddition: data.sectorAddition,
              },
            });
        await tx.siteBatchMembership.create({
          data: {
            batchId: batch.id,
            siteId: site.id,
            sourceRow: row.rowNumber,
            importedSiteType: data.siteType,
            importedSectorAddition: data.sectorAddition,
            classificationReviewRequired: classificationChanged && hasProgress,
          },
        });
        const needsWorkflow =
          !existing || !existing.workflows[0] || (classificationChanged && !hasProgress);
        if (needsWorkflow) {
          if (existing)
            await tx.siteWorkflow.updateMany({
              where: { siteId: site.id, active: true },
              data: { active: false },
            });
          const template = await tx.workflowTemplate.findFirst({
            where: { siteType: data.siteType, sectorAddition: data.sectorAddition, active: true },
            orderBy: { version: 'desc' },
            include: { steps: true },
          });
          if (!template)
            throw new Error(
              `No active workflow template for ${data.siteType}/${data.sectorAddition}`,
            );
          const cycleNumber = (await tx.siteWorkflow.count({ where: { siteId: site.id } })) + 1;
          await tx.siteWorkflow.create({
            data: {
              siteId: site.id,
              templateId: template.id,
              cycleNumber,
              steps: {
                create: template.steps.map((item) => ({
                  templateStepId: item.id,
                  state: item.prerequisiteCode ? 'LOCKED' : 'ACTIONABLE',
                })),
              },
            },
          });
        }
      }
      await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: 'COMMITTED', committedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityType: 'import_batch',
          entityId: batch.id,
          action: 'IMPORT_COMMITTED',
          newValue: {
            reportingWeek: batch.reportingWeek.toISOString(),
            acceptedRows: batch.acceptedRows,
          },
          requestId: request.id,
        },
      });
      const chats = await tx.botChat.findMany({
        where: { active: true, importSummaries: true, serviceCenters: { some: {} } },
        include: { serviceCenters: { include: { serviceCenter: true } } },
      });
      const normalized = batch.rows.map(
        (row) =>
          row.normalizedData as {
            region: string;
            serviceCenter: string;
            siteType: string;
            sectorAddition: string;
          },
      );
      const countBy = (values: string[]) =>
        values.reduce<Record<string, number>>(
          (counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }),
          {},
        );
      for (const chat of chats) {
        const chatServiceCenters = chat.serviceCenters.map((item) => item.serviceCenter.code);
        const scopedRows = normalized.filter((item) =>
          chatServiceCenters.includes(item.serviceCenter),
        );
        if (!scopedRows.length) continue;
        const payload: Prisma.InputJsonValue = {
          batchId: batch.id,
          reportingWeek: batch.reportingWeek.toISOString(),
          acceptedRows: scopedRows.length,
          rejectedRows: 0,
          scenarioCounts: countBy(
            scopedRows.map((item) => `${item.siteType}_${item.sectorAddition}`),
          ),
          serviceCenterCounts: countBy(scopedRows.map((item) => item.serviceCenter)),
          regionCounts: countBy(scopedRows.map((item) => item.region)),
        };
        await tx.notification.create({
          data: {
            idempotencyKey: `IMPORT_COMMITTED:${batch.id}:${chat.id}`,
            recipientChatId: chat.telegramChatId,
            messageType: 'IMPORT_COMMITTED',
            payload,
          },
        });
      }
      return { batchId: batch.id, status: 'COMMITTED', requestId: request.id };
    });
    return result;
  });

  app.get('/api/imports/:batchId/source', async (request, reply) => {
    const actor = await actorFrom(request);
    requireRole(actor, [Role.ADMIN]);
    const { batchId } = z.object({ batchId: z.string().uuid() }).parse(request.params);
    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw notFound('Import batch not found.');
    return reply
      .header('content-disposition', `attachment; filename="${safeFilename(batch.sourceFilename)}"`)
      .type('application/octet-stream')
      .send(createReadStream(join(config.STORAGE_DIR, batch.storageKey)));
  });
}
