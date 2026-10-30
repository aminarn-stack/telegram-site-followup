# Application API

All `/api` responses use JSON except file downloads. Authenticated endpoints require `Authorization: Bearer <session-token>`. Errors have `{ error: { code, message, details?, requestId } }`.

## Authentication and navigation

| Method | Path                     | Access               | Purpose                                                                 |
| ------ | ------------------------ | -------------------- | ----------------------------------------------------------------------- |
| POST   | `/api/auth/telegram`     | Public, rate limited | Validate Telegram `initData` and issue an eight-hour session.           |
| POST   | `/api/auth/dev`          | Development only     | Sign in the seeded local administrator. Never registered in production. |
| GET    | `/api/deep-links/:token` | Public token         | Resolve an opaque, expiring navigation target.                          |
| POST   | `/api/telegram/webhook`  | Telegram secret      | Process bot updates after webhook-secret validation.                    |

## Imports

| Method | Path                                               | Access | Purpose                                                                           |
| ------ | -------------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| POST   | `/api/imports?reportingWeek=YYYY-MM-DD`            | Admin  | Upload `.xlsx` or `.csv`, validate 1–40 rows, store checksum, and create preview. |
| GET    | `/api/imports`                                     | Admin  | Batch history.                                                                    |
| GET    | `/api/imports/:batchId`                            | Admin  | Preview, errors, counts, and membership.                                          |
| GET    | `/api/imports/:batchId/errors.csv`                 | Admin  | Download rejected-row details.                                                    |
| GET    | `/api/imports/:batchId/source`                     | Admin  | Download the stored source as an attachment.                                      |
| POST   | `/api/imports/:batchId/commit`                     | Admin  | Atomically commit a fully valid preview.                                          |
| POST   | `/api/admin/reclassifications/:membershipId/apply` | Admin  | Approve a classification change and start a new versioned cycle.                  |

## Sites and workflow

| Method | Path                                   | Access               | Purpose                                                                              |
| ------ | -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| GET    | `/api/dashboard`                       | Authorized           | Counts, latest batch, and permitted blockers.                                        |
| GET    | `/api/sites`                           | Authorized           | Paginated region-authorized sites with filters and search.                           |
| GET    | `/api/sites/:publicId`                 | Authorized region    | Metadata, workflow, evidence, escalations, and audit.                                |
| PATCH  | `/api/site-steps/:siteStepId`          | Admin or contributor | Record an allowed answer with optimistic version and optional/required comment.      |
| POST   | `/api/site-steps/:siteStepId/evidence` | Admin or contributor | Upload JPEG, PNG, WebP, or PDF evidence.                                             |
| POST   | `/api/site-steps/:siteStepId/reopen`   | Admin                | Reopen a branch with a mandatory reason and mark completed descendants Needs Review. |
| GET    | `/api/evidence/:evidenceId`            | Authorized region    | Download evidence as an attachment.                                                  |

Step update body:

```json
{ "answer": "Available", "comment": "Access confirmed", "version": 2 }
```

## Reporting and administration

| Method   | Path                                     | Access     | Purpose                                                                      |
| -------- | ---------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| GET      | `/api/reports/weekly?week=YYYY-MM-DD`    | Authorized | Status totals and blocker aggregation for permitted regions.                 |
| GET      | `/api/audit`                             | Admin      | Filtered immutable audit history.                                            |
| GET/POST | `/api/admin/users`                       | Admin      | List or upsert Telegram users, roles, active state, and region access.       |
| GET/POST | `/api/admin/regions`                     | Admin      | List or upsert regions.                                                      |
| GET/POST | `/api/admin/chats`                       | Admin      | List or upsert bot chats and reminder settings.                              |
| GET      | `/api/admin/templates`                   | Admin      | Inspect versioned workflow templates and exact steps.                        |
| POST     | `/api/admin/templates/:templateId/clone` | Admin      | Create the next validated active version without rewriting history.          |
| POST     | `/api/admin/plans/archive`               | Admin      | Archive active weekly workflows and clear the dashboard for the next import. |

## Filtering

`GET /api/sites` accepts `week`, `region`, `siteType`, `sectorAddition`, `status`, `assignedUser`, `search`, `page`, and `pageSize`. `GET /api/audit` accepts `entityType`, `entityId`, `actorId`, `from`, `to`, and `page`.
