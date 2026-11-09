# Telegram Site Follow-up

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
pnpm db:seed:prod
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

## VPS deployment without a domain

The production app can use a static public IPv4 address instead of a domain. Telegram still
requires an HTTPS Mini App URL and an HTTPS webhook, so plain `http://<ip>` is not supported. This
deployment uses a publicly trusted, six-day Let's Encrypt IP certificate. It requires Certbot 5.4
or newer, automatic renewal, ports 80 and 443, and a static public IPv4 address.

1. Copy the example environment and use the VPS IP as both public origins:

   ```bash
   export PUBLIC_IP=203.0.113.10
   cp .env.example .env
   ```

   Set these production values in `.env`:

   ```dotenv
   NODE_ENV=production
   WEB_ORIGIN=https://203.0.113.10
   PUBLIC_BASE_URL=https://203.0.113.10
   POSTGRES_PASSWORD=<random-hex-password>
   JWT_SECRET=<at-least-32-random-characters>
   TELEGRAM_BOT_TOKEN=<botfather-token>
   TELEGRAM_WEBHOOK_SECRET=<letters-numbers-underscore-or-hyphen>
   DEFAULT_ADMIN_TELEGRAM_ID=<numeric-telegram-user-id>
   TRUST_PROXY=true
   ```

   Generate URL-safe secrets with `openssl rand -hex 32` and protect the file with
   `chmod 600 .env`.

2. Start the database, API, and worker. PostgreSQL is not published and the API is bound only to
   the VPS loopback interface:

   ```bash
   docker compose -f docker-compose.ip.yml config
   docker compose -f docker-compose.ip.yml up -d --build
   docker compose -f docker-compose.ip.yml exec app node dist/prisma/seed.js
   curl http://127.0.0.1:3000/api/health
   ```

3. Install Nginx, create the ACME webroot, and start with the HTTP bootstrap configuration:

   ```bash
   sudo apt update
   sudo apt install -y nginx snapd
   sudo mkdir -p /var/www/certbot
   sudo cp deploy/ip/nginx-bootstrap.conf /etc/nginx/sites-available/telegram-followup
   sudo ln -sfn /etc/nginx/sites-available/telegram-followup /etc/nginx/sites-enabled/telegram-followup
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. Install a current Certbot. The Ubuntu package may be too old for IP certificates, so use the
   maintained snap and verify that the result is 5.4 or newer:

   ```bash
   sudo snap install core
   sudo snap refresh core
   sudo snap install --classic certbot
   sudo snap refresh certbot
   /snap/bin/certbot --version
   ```

5. Test issuance against staging first, then request the trusted certificate. Replace the IP and
   email in both commands:

   ```bash
   sudo /snap/bin/certbot certonly --staging \
     --preferred-profile shortlived \
     --webroot --webroot-path /var/www/certbot \
     --ip-address 203.0.113.10 \
     --agree-tos -m admin@example.com --no-eff-email

   sudo /snap/bin/certbot certonly \
     --preferred-profile shortlived \
     --webroot --webroot-path /var/www/certbot \
     --ip-address 203.0.113.10 \
     --agree-tos -m admin@example.com --no-eff-email
   ```

6. Render the HTTPS Nginx configuration and reload Nginx:

   ```bash
   sed "s/__PUBLIC_IP__/${PUBLIC_IP}/g" deploy/ip/nginx-https.conf.template | \
     sudo tee /etc/nginx/sites-available/telegram-followup >/dev/null
   sudo nginx -t
   sudo systemctl reload nginx
   curl "https://${PUBLIC_IP}/api/health"
   ```

7. IP certificates last six days. Add a deploy hook so Nginx reloads after every automatic renewal,
   and verify the Certbot timer and renewal process:

   ```bash
   sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
   printf '#!/bin/sh\nsystemctl reload nginx\n' | \
     sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx >/dev/null
   sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
   systemctl list-timers | grep certbot
   sudo /snap/bin/certbot renew --dry-run
   ```

8. Configure the HTTPS IP webhook, Mini App menu button, and bot commands automatically:

   ```bash
   docker compose -f docker-compose.ip.yml exec app node scripts/configure-telegram.mjs
   ```

9. Verify the public endpoint and deployment:

   ```bash
   curl "https://${PUBLIC_IP}/api/health"
   docker compose -f docker-compose.ip.yml ps
   docker compose -f docker-compose.ip.yml logs --tail=100 app worker
   ```

The certificate is tied to the IP. If the VPS public IP changes, update `PUBLIC_BASE_URL` and
`WEB_ORIGIN`, issue a certificate for the new IP, render the Nginx template again, rebuild the
containers, and rerun `node scripts/configure-telegram.mjs` inside the app container.

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

5. Seed the first administrator with `DEFAULT_ADMIN_TELEGRAM_ID`, then use Administration to add
   users, SC access, and every team/SC Telegram group. Each group must be assigned at least one
   service center; unassigned groups receive no site data.
6. Register `/start`, `/open`, `/summary`, `/remind`, `/export`, `/flowexport`, `/pending`, and
   `/help` through BotFather. `/export` sends the current site summary and the status of each step.
   `/flowexport` sends a second workbook ordered by SC, Region, and Site ID with each site's current
   steps, statuses, answers, and directly dependent next steps. `/summary`, `/remind`, scheduled
   reminders, import summaries, blocker alerts, resolutions, and completion messages use the same
   group-to-SC scope. Region remains an independent reporting and filtering field. Administrators
   can use a private bot chat or the web dashboard for an all-SC view and export; the workbook
   includes an overview sheet by team/SC.

In groups with privacy mode enabled, address commands to the bot, for example
`/export@YourBotUsername`. The group’s Open button leads to the bot’s private chat, where you can
launch the Mini App. Start the private chat once to receive dashboard Excel exports there.

### Pending cases by owner

`/pending` sends a scoped Excel workbook with one row per pending step and a count of affected
sites for each owner. A site can be counted for both owners. Run the Telegram configuration script
again after upgrading to add `/pending` to the bot’s command menu.

MTNI owns Installation plan by RND, BP issuance by RMPS, Core/SID/CGI/IP receipt, Material delivery,
and Sharing result. Contractor owns the remaining steps. Pending time covers the current continuous
period a step is actionable, blocked, or needs review. Each site card and export summary shows
the oldest pending step for each owner. Step Details shows the time for each individual step.
A lower bound means an existing step was already pending at its last saved timestamp before the
upgrade.

### BP issuance milestone

In any flow, open **BP issuance by RMPS** and select **Done - All previous steps considered as Done**.
If the step is locked, use **Set BP milestone**. This closes the applicable earlier steps and
unlocks the next steps that depend on BP. Earlier recorded answers, comments, and evidence stay
available. An administrator can use **Reopen BP milestone** to restore the prerequisite checks.

### Workflow licensing branch

- Every flow includes **License required** immediately after **BP issuance by RMPS**.
- `Yes` opens **License issuance**, with `Done` and `Not Done` answers.
- `Requested - No` marks **License issuance** as not applicable.
- Existing downstream steps keep their original BP-based prerequisites and do not wait for the
  license branch.

### Team / SC isolation

- Include both `Region` and `SC` for every site in the weekly import. One SC may own sites in any
  number of regions.
- Region and SC codes are created automatically from committed imports. Administration uses the
  imported SC list for user and Telegram-group access; codes cannot be added or typed manually.
- Assign each contributor or viewer only the service centers they support.
- In **Administration → Telegram groups and reminders**, assign each Telegram chat ID to its team/SC
  codes. A group without an assigned SC is deliberately blocked from receiving site data.
- A non-admin command is limited to the intersection of the user's SCs and the group's SCs.
- An admin command issued inside a configured group uses that group's scope. The same command in a
  private chat includes all SCs.
- The admin dashboard shows combined totals, a breakdown per team/SC, an all-SC export, and a
  separate export for each team/SC.

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
