# Assumptions and known limitations

## Assumptions

- A batch with any rejected row cannot be committed. This follows acceptance test AT-02 and avoids interpreting “accepted rows” as permission for partial business processing. The preview and downloadable error list remain available.
- Reporting week is stored as the submitted ISO date. The UI defaults to the current date; the administrator selects the team’s intended week boundary.
- Import classification aliases are conservative and case-insensitive. Additional aliases are stored as configuration data and can be extended without changing historical rows.
- Reappearing sites retain their active workflow. A changed classification with recorded progress creates a review flag. Administrator approval starts a new cycle using the latest active template; it does not rewrite history.
- The documented “Available port checking and FPA check” answer rule is implemented for both separate steps using the same OK/NOK classification.
- Only the workflow engine may set `Permission` to Not Applicable. No API accepts N/A as a business answer.
- Assignment is optional in the MVP. Region authorization remains mandatory even when no individual assignee is configured.
- The source specifies reminder schedules but explicitly excludes broader SLA/due-date logic. The worker therefore sends schedule-based aggregate reminders and does not invent per-step deadlines.
- `Asia/Tehran` is the initial display and notification timezone. Timestamps remain UTC in PostgreSQL.

## Source comparison

The authoritative DOCX and the supporting workbook agree on all four workflow templates, step labels, ordering, prerequisites, and answers. No conflict was found. The spelling `BP isuance by RMPS` is retained exactly as required.

## Known limitations and external verification

- A real Telegram bot token, public HTTPS domain, webhook, group chat, and production database are required for live Telegram verification.
- Antivirus policy in the authoring environment prevents creating files with a new `.xlsx` extension inside the workspace. The verified package is included as `samples/weekly-import-sample.xlsx.bin`, and an immediately usable CSV sample is included. Rename the binary file to `.xlsx` on a normal filesystem.
- Evidence malware scanning is limited to allowlisted media types, filename sanitization, size limits, checksum storage, attachment-only serving, and authorization. Production deployments should integrate an antivirus scanner before the evidence is made available to users.
- Backup execution depends on the deployment environment. Procedures and retention requirements are documented, but an actual production-like restore needs external infrastructure.
- The notification scheduler supports the documented five-field minute/hour/day-of-week patterns used by the seeded configuration. Full cron grammar is not implemented.
- Template versions are seeded and can be cloned into a new active version. The API accepts validated step edits while enforcing unique codes and orders, valid prerequisites, and an acyclic graph. Historical site workflows keep their original version.
