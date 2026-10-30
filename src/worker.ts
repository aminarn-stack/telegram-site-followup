import { loadConfig } from './config.js';
import { prisma } from './db.js';
import { processNotificationQueue } from './bot.js';
import { getReminderStats } from './services/reminder.js';

const config = loadConfig();

function scheduleMatches(expression: string, date: Date, timezone: string) {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const local = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    minute: '2-digit',
    hour: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const value = Object.fromEntries(local.map((item) => [item.type, item.value]));
  const dayMap: Record<string, string> = {
    Sun: '0',
    Mon: '1',
    Tue: '2',
    Wed: '3',
    Thu: '4',
    Fri: '5',
    Sat: '6',
  };
  const [minute, hour, , , weekdays] = parts;
  return (
    minute === value.minute &&
    hour === value.hour &&
    (weekdays === '*' || weekdays?.split(',').includes(dayMap[value.weekday ?? ''] ?? '-1'))
  );
}

async function enqueueReminders(now = new Date()) {
  const chats = await prisma.botChat.findMany({
    where: { active: true, reminders: true, serviceCenters: { some: {} } },
    include: { serviceCenters: { include: { serviceCenter: true } } },
  });
  const dueChats = chats.filter((chat) =>
    scheduleMatches(chat.reminderSchedule, now, chat.timezone),
  );
  if (!dueChats.length) return;
  for (const chat of dueChats) {
    const serviceCenters = chat.serviceCenters.map((item) => item.serviceCenter.code);
    const stats = await getReminderStats({
      site: { serviceCenter: { code: { in: serviceCenters } } },
    });
    const minuteKey = now.toISOString().slice(0, 16);
    await prisma.notification.upsert({
      where: { idempotencyKey: `REMINDER:${chat.id}:${minuteKey}` },
      update: {},
      create: {
        idempotencyKey: `REMINDER:${chat.id}:${minuteKey}`,
        recipientChatId: chat.telegramChatId,
        messageType: 'REMINDER',
        payload: {
          recipient: chat.groupName ?? chat.telegramChatId.toString(),
          ...stats,
          deepLinkTarget: { kind: 'filters', serviceCenters },
        },
      },
    });
  }
}

async function tick() {
  await enqueueReminders();
  await processNotificationQueue(config);
}

tick().catch(console.error);
const timer = setInterval(() => tick().catch(console.error), 60_000);

async function shutdown() {
  clearInterval(timer);
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
