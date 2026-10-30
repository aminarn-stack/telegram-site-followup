import { Bot, InlineKeyboard, InputFile, type Context } from 'grammy';
import type { Prisma, Role } from '@prisma/client';
import type { Config } from './config.js';
import { prisma } from './db.js';
import { opaqueToken, sha256 } from './lib/security.js';
import { createCurrentStatusExport } from './services/status-export.js';
import { createSiteFlowExport } from './services/site-flow-export.js';
import { getReminderStats } from './services/reminder.js';

function launchKeyboard(config: Config, startParam?: string) {
  const url = new URL(config.PUBLIC_BASE_URL);
  if (startParam) url.searchParams.set('startapp', startParam);
  return new InlineKeyboard().webApp('Open App', url.toString());
}

async function authorizedUser(telegramUserId?: number) {
  if (!telegramUserId) return null;
  return prisma.user.findUnique({
    where: { telegramUserId: BigInt(telegramUserId), active: true },
    include: {
      regions: { include: { region: true } },
      serviceCenters: { include: { serviceCenter: true } },
    },
  });
}

async function configuredChat(telegramChatId: number | undefined, chatType?: string) {
  if (!telegramChatId || chatType === 'private') return null;
  return prisma.botChat.findUnique({
    where: { telegramChatId: BigInt(telegramChatId) },
    include: { serviceCenters: { include: { serviceCenter: true } } },
  });
}

function effectiveServiceCenters(
  user: NonNullable<Awaited<ReturnType<typeof authorizedUser>>>,
  chat: Awaited<ReturnType<typeof configuredChat>>,
) {
  const userServiceCenters = user.serviceCenters.map((item) => item.serviceCenter.code);
  const chatServiceCenters = chat?.serviceCenters.map((item) => item.serviceCenter.code) ?? [];
  if (chat && !chat.active) return [];
  return resolveGroupServiceCenters(
    user.role,
    userServiceCenters,
    chat ? chatServiceCenters : null,
  );
}

export function resolveGroupServiceCenters(
  role: Role,
  userServiceCenters: string[],
  chatServiceCenters: string[] | null,
): string[] | null {
  if (chatServiceCenters === null) return role === 'ADMIN' ? null : userServiceCenters;
  if (!chatServiceCenters.length) return [];
  return role === 'ADMIN'
    ? chatServiceCenters
    : userServiceCenters.filter((serviceCenter) => chatServiceCenters.includes(serviceCenter));
}

function workflowServiceCenterScope(serviceCenters: string[] | null) {
  return serviceCenters === null
    ? {}
    : { site: { serviceCenter: { code: { in: serviceCenters } } } };
}

async function commandScope(ctx: Context) {
  const user = await authorizedUser(ctx.from?.id);
  if (!user) return { error: 'Your Telegram account is not authorized.' } as const;
  const chat = await configuredChat(ctx.chat?.id, ctx.chat?.type);
  if (ctx.chat?.type !== 'private' && !chat)
    return {
      error:
        'This Telegram group is not configured. Ask an administrator to assign its service center (SC).',
    } as const;
  const serviceCenters = effectiveServiceCenters(user, chat);
  if (serviceCenters !== null && !serviceCenters.length)
    return { error: 'You do not have access to this group’s assigned team/SC scope.' } as const;
  return { user, chat, serviceCenters } as const;
}

export function createBot(config: Config) {
  if (!config.TELEGRAM_BOT_TOKEN) return null;
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
  bot.command('start', async (ctx) => {
    const scope = await commandScope(ctx);
    if ('error' in scope) return ctx.reply(scope.error);
    return ctx.reply('Open the weekly site follow-up workspace.', {
      reply_markup: launchKeyboard(config),
    });
  });
  bot.command('open', async (ctx) => {
    const scope = await commandScope(ctx);
    if ('error' in scope) return ctx.reply(scope.error);
    return ctx.reply('Open the site follow-up app.', { reply_markup: launchKeyboard(config) });
  });
  bot.command('help', async (ctx) => {
    const scope = await commandScope(ctx);
    if ('error' in scope) return ctx.reply(scope.error);
    return ctx.reply(
      '/open opens the app. /summary, /remind, /export, and /flowexport use this group’s assigned SC scope. /flowexport lists every site with its current and next steps. Administrators can run exports in a private chat for the all-SC view.',
    );
  });
  bot.command('summary', async (ctx) => {
    const scope = await commandScope(ctx);
    if ('error' in scope) return ctx.reply(scope.error);
    const workflows = await prisma.siteWorkflow.findMany({
      where: {
        active: true,
        ...workflowServiceCenterScope(scope.serviceCenters),
      },
      include: {
        site: { include: { region: true } },
        steps: { where: { state: 'BLOCKED' }, include: { templateStep: true } },
      },
    });
    const totals = countBy(workflows.map((item) => item.status));
    const blockersByStep = countBy(
      workflows.flatMap((item) => item.steps.map((step) => step.templateStep.label)),
    );
    const blockersByRegion = countBy(
      workflows.flatMap((item) => item.steps.map(() => item.site.region.code)),
    );
    const startOfWeek = new Date();
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay());
    startOfWeek.setUTCHours(0, 0, 0, 0);
    const completedThisWeek = workflows.filter(
      (item) => item.completedAt && item.completedAt >= startOfWeek,
    ).length;
    const text = [
      scope.chat?.groupName
        ? `Current site summary — ${scope.chat.groupName}`
        : 'Current site summary — all authorized SCs',
      ...Object.entries(totals).map(
        ([status, count]) => `${status.replaceAll('_', ' ')}: ${count}`,
      ),
      `Completed this week: ${completedThisWeek}`,
      `Blockers by step: ${formatCounts(blockersByStep)}`,
      `Blockers by region: ${formatCounts(blockersByRegion)}`,
    ].join('\n');
    return ctx.reply(text, { reply_markup: launchKeyboard(config) });
  });
  bot.command('remind', async (ctx) => {
    const scope = await commandScope(ctx);
    if ('error' in scope) return ctx.reply(scope.error);
    const stats = await getReminderStats(workflowServiceCenterScope(scope.serviceCenters));
    const text = formatNotification(
      'REMINDER',
      { recipient: scope.chat?.groupName ?? scope.user.firstName, ...stats },
      config.APP_TIMEZONE,
    );
    return ctx.reply(text, { reply_markup: launchKeyboard(config) });
  });
  bot.command('export', async (ctx) => {
    const scope = await commandScope(ctx);
    if ('error' in scope) return ctx.reply(scope.error);
    await ctx.replyWithChatAction('upload_document');
    const report = await createCurrentStatusExport({
      role: scope.serviceCenters === null ? scope.user.role : 'VIEWER',
      serviceCenters: scope.serviceCenters ?? [],
    });
    return ctx.replyWithDocument(new InputFile(report.buffer, report.filename), {
      caption: `Current site status with detailed steps (${report.siteCount} sites).`,
    });
  });
  bot.command('flowexport', async (ctx) => {
    const scope = await commandScope(ctx);
    if ('error' in scope) return ctx.reply(scope.error);
    await ctx.replyWithChatAction('upload_document');
    const report = await createSiteFlowExport({
      role: scope.serviceCenters === null ? scope.user.role : 'VIEWER',
      serviceCenters: scope.serviceCenters ?? [],
    });
    return ctx.replyWithDocument(new InputFile(report.buffer, report.filename), {
      caption: `Sites by SC and region with current and next steps (${report.siteCount} sites).`,
    });
  });
  bot.catch((error) => console.error('Telegram bot update failed', error));
  return bot;
}

export async function processNotificationQueue(config: Config) {
  const bot = createBot(config);
  if (!bot) return { processed: 0 };
  const due = await prisma.notification.findMany({
    where: {
      state: { in: ['PENDING', 'FAILED'] },
      nextAttemptAt: { lte: new Date() },
      attempts: { lt: 5 },
    },
    take: 20,
    orderBy: { createdAt: 'asc' },
  });
  let processed = 0;
  for (const notification of due) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: { state: 'PROCESSING', attempts: { increment: 1 } },
    });
    try {
      const payload = notification.payload as Record<string, unknown>;
      const text = formatNotification(notification.messageType, payload, config.APP_TIMEZONE);
      const startParam = payload.deepLinkTarget
        ? await createDeepLink(payload.deepLinkTarget as Record<string, unknown>)
        : undefined;
      const result = await bot.api.sendMessage(notification.recipientChatId.toString(), text, {
        reply_markup: launchKeyboard(config, startParam),
      });
      await prisma.notification.update({
        where: { id: notification.id },
        data: { state: 'SENT', telegramMessageId: BigInt(result.message_id), lastError: null },
      });
      processed += 1;
    } catch (error) {
      const attempts = notification.attempts + 1;
      const delayMinutes = Math.min(60, 2 ** attempts);
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          state: 'FAILED',
          lastError:
            error instanceof Error ? error.message.slice(0, 500) : 'Unknown Telegram error',
          nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
        },
      });
    }
  }
  return { processed };
}

function formatNotification(type: string, payload: Record<string, unknown>, timezone: string) {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());
  if (type === 'ESCALATION')
    return `Blocked site escalation\nSite: ${payload.siteId}\nSC: ${payload.serviceCenter}\nRegion: ${payload.region}\nStep: ${payload.step}\nResult: ${payload.answer}\nComment: ${payload.comment}\nUpdated by: ${payload.updater}\nTime: ${payload.eventTime ?? time}`;
  if (type === 'RESOLUTION')
    return `Blocked item resolved\nSite: ${payload.siteId}\nStep: ${payload.step}\nResult: ${payload.answer}\nUpdated by: ${payload.updater}\nTime: ${payload.eventTime ?? time}`;
  if (type === 'SITE_COMPLETED')
    return `Site implementation completed\nSite: ${payload.siteId}\nSC: ${payload.serviceCenter}\nRegion: ${payload.region}\nUpdated by: ${payload.updater}\nTime: ${payload.eventTime ?? time}`;
  if (type === 'IMPORT_COMMITTED')
    return `Weekly import committed\nWeek: ${String(payload.reportingWeek).slice(0, 10)}\nAccepted: ${payload.acceptedRows}\nRejected: ${payload.rejectedRows}\nSCs: ${formatCounts(payload.serviceCenterCounts as Record<string, number>)}\nScenarios: ${formatCounts(payload.scenarioCounts as Record<string, number>)}\nRegions: ${formatCounts(payload.regionCounts as Record<string, number>)}`;
  if (type === 'REMINDER')
    return `Weekly follow-up reminder\nRecipient: ${payload.recipient ?? 'Team'}\nActionable sites: ${payload.actionable}\nBlocked sites: ${payload.blocked}`;
  return `Site follow-up notification\n${JSON.stringify(payload)}`;
}

export async function resolveDeepLink(token: string) {
  const record = await prisma.deepLinkToken.findUnique({ where: { tokenHash: sha256(token) } });
  return record && record.expiresAt > new Date() ? record.target : null;
}

export async function createDeepLink(target: Record<string, unknown>, hours = 168) {
  const token = opaqueToken();
  await prisma.deepLinkToken.create({
    data: {
      tokenHash: sha256(token),
      target: target as Prisma.InputJsonObject,
      expiresAt: new Date(Date.now() + hours * 3_600_000),
    },
  });
  return token;
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>(
    (counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }),
    {},
  );
}

function formatCounts(counts: Record<string, number> | undefined) {
  if (!counts || !Object.keys(counts).length) return 'None';
  return Object.entries(counts)
    .map(([key, value]) => `${key} ${value}`)
    .join(', ');
}
