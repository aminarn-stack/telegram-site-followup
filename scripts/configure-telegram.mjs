const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const publicBaseUrl = process.env.PUBLIC_BASE_URL;

if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required.');
if (!webhookSecret) throw new Error('TELEGRAM_WEBHOOK_SECRET is required.');
if (!publicBaseUrl) throw new Error('PUBLIC_BASE_URL is required.');

const publicUrl = new URL(publicBaseUrl);
if (publicUrl.protocol !== 'https:') {
  throw new Error('PUBLIC_BASE_URL must use HTTPS for Telegram Mini Apps.');
}

async function telegram(method, body) {
  const response = await globalThis.fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`${method} failed: ${result.description ?? `HTTP ${response.status}`}`);
  }
  return result.result;
}

await telegram('setWebhook', {
  url: new URL('/api/telegram/webhook', publicUrl).toString(),
  secret_token: webhookSecret,
  allowed_updates: ['message', 'callback_query'],
});

await telegram('setChatMenuButton', {
  menu_button: {
    type: 'web_app',
    text: 'Open App',
    web_app: { url: publicUrl.toString() },
  },
});

await telegram('setMyCommands', {
  commands: [
    { command: 'start', description: 'Open the bot' },
    { command: 'open', description: 'Open the Mini App' },
    { command: 'summary', description: 'Show the current site summary' },
    { command: 'remind', description: 'Send actionable reminders' },
    { command: 'export', description: 'Export detailed status' },
    { command: 'flowexport', description: 'Export current and next steps' },
    { command: 'help', description: 'Show available commands' },
  ],
});

console.log(`Telegram configured for ${publicUrl.origin}.`);
import process from 'node:process';

