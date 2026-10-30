WITH ranked_templates AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "code" ORDER BY "version" DESC) AS version_rank
  FROM "WorkflowTemplate"
)
UPDATE "WorkflowTemplate" AS template
SET
  "active" = (ranked.version_rank = 1),
  "effectiveTo" = CASE
    WHEN ranked.version_rank = 1 THEN NULL
    ELSE COALESCE(template."effectiveTo", CURRENT_TIMESTAMP)
  END
FROM ranked_templates AS ranked
WHERE template."id" = ranked."id";
