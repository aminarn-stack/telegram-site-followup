# Telegram Site Follow Up

Production-oriented MVP for weekly site follow-up through a Telegram Mini App and bot. The API and PostgreSQL database are the system of record. Workflow prerequisites, conditional permission handling, escalation state, authorization, and audit creation are enforced on the server.

## Local setup

Prerequisites: Node.js 22+, pnpm 10+, and PostgreSQL 16+. The commands below use Docker Desktop to provide PostgreSQL, so Docker Desktop must be installed and running.

### Windows prerequisites

Install Node.js and Docker Desktop from an Administrator PowerShell prompt, then restart PowerShell and start Docker Desktop:

```powershell
winget install --exact --id OpenJS.NodeJS.LTS
winget install --exact --id Docker.DockerDesktop
```

If winget reports `0x8a15000f` or says source data is missing, repair its source cache from the Administrator prompt first:

```powershell
winget source reset --force
```

Enable the pnpm version declared in `package.json`:

```powershell
corepack enable
corepack prepare pnpm@11.25.0 --activate
node --version
pnpm --version
docker --version
```

If `node`, `pnpm`, or `docker` is still reported as unknown, close and reopen PowerShell so it receives the updated `PATH`. Docker Desktop may also require WSL 2/virtualization setup on first launch.

### Start locally

From the project directory:

```powershell
Copy-Item .env.example .env -ErrorAction SilentlyContinue
pnpm install
pnpm db:generate
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://localhost:5173`. Outside Telegram, development mode signs in as `DEFAULT_ADMIN_TELEGRAM_ID`. This development fallback is not registered in production.

Use [weekly-import-sample.csv](samples/weekly-import-sample.csv) for the first import. `samples/weekly-import-sample.xlsx.bin` is a verified XLSX package produced by the artifact generator; environments that allow Office extensions can rename it to `weekly-import-sample.xlsx`.

## Production start

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm start
pnpm start:worker
```

Use a process manager for the API and worker. Terminate TLS at Nginx or another reverse proxy, expose only HTTPS, and mount `STORAGE_DIR` on backed-up persistent storage. Retain at least seven daily database and evidence backups. Test a restore before acceptance.

## Docker

Copy `.env.example` to `.env`, set secrets and the public URL, then run:

```bash
docker compose config
docker compose up --build
```

The Compose file runs PostgreSQL, the API/Mini App service, and a separate notification worker.

## Telegram bot configuration

1. Create the bot with BotFather and keep privacy mode enabled.
2. Set the Mini App URL and menu button to `PUBLIC_BASE_URL`.
3. Set `TELEGRAM_BOT_TOKEN` and a random `TELEGRAM_WEBHOOK_SECRET` in `.env`.
4. Configure the webhook:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-domain.example/api/telegram/webhook","secret_token":"YOUR_WEBHOOK_SECRET","allowed_updates":["message","callback_query"]}'
```

5. Seed the first administrator with `DEFAULT_ADMIN_TELEGRAM_ID`, then use Administration to add users, region access, and the team group chat ID.
6. Register `/start`, `/open`, `/summary`, `/remind`, `/export`, and `/help` through BotFather. The
   `/export` command sends an Excel workbook containing the current site summary and detailed
   status of every workflow step the requesting user is authorized to view. The `/remind` command
   immediately sends actionable and blocked-site counts for the requesting user's permitted
   regions. Scheduled reminders continue to use each Telegram group's configured minute, hour,
   and weekday schedule.

At the end of a reporting week, an administrator can use **Administration → Archive current
plan**. Archiving preserves workflows and audit history while clearing all site IDs from the
active dashboard. Committing the next import reactivates only the sites present in that file.

## Operations

- Health check: `GET /api/health`.
- Logs are structured JSON through Fastify/Pino and include request IDs.
- Notification retries use bounded exponential backoff with a five-attempt limit.
- Evidence is served only as an authenticated attachment, never inline.
- Rotate a compromised bot token in BotFather, update the secret, restart API/worker, and reset the webhook.
- Restore test: restore a recent PostgreSQL dump into an isolated database, point a test deployment at the restored storage copy, and verify sites, workflows, audits, and evidence metadata.

Additional documentation: [API](docs/api.md), [traceability](docs/requirements-traceability.md), and [assumptions and limitations](docs/assumptions.md).
