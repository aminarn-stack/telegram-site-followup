-- Correct user-facing workflow wording and answer capitalization.
UPDATE "WorkflowTemplateStep"
SET "label" = CASE "code"
    WHEN 'AVAILABLE_PORT' THEN 'Available port check'
    WHEN 'BP_REQUEST' THEN 'BP request'
    WHEN 'BP_ISSUANCE' THEN 'BP issuance by RMPS'
    WHEN 'SHARING_RESULT' THEN 'Sharing result'
    ELSE "label"
END
WHERE "code" IN ('AVAILABLE_PORT', 'BP_REQUEST', 'BP_ISSUANCE', 'SHARING_RESULT');

UPDATE "WorkflowTemplateStep"
SET "allowedAnswers" = '["Done - Permission needed", "Done - Permission not needed", "Not Done"]'::jsonb
WHERE "code" = 'INITIAL_ACCESS';

UPDATE "WorkflowTemplateStep"
SET "allowedAnswers" = '["Submitted", "Not Submitted"]'::jsonb
WHERE "code" = 'MR_REQUEST';

UPDATE "WorkflowTemplateStep"
SET "allowedAnswers" = '["Delivered", "Not Delivered"]'::jsonb
WHERE "code" = 'MATERIAL_DELIVERY';

UPDATE "SiteStep" AS site_step
SET "answer" = CASE site_step."answer"
    WHEN 'Done-Permission needed' THEN 'Done - Permission needed'
    WHEN 'Done-Permission no needed' THEN 'Done - Permission not needed'
    WHEN 'Not submitted' THEN 'Not Submitted'
    WHEN 'Not delivered' THEN 'Not Delivered'
    ELSE site_step."answer"
END
FROM "WorkflowTemplateStep" AS template_step
WHERE site_step."templateStepId" = template_step."id"
  AND (
    (template_step."code" = 'INITIAL_ACCESS' AND site_step."answer" IN ('Done-Permission needed', 'Done-Permission no needed'))
    OR (template_step."code" = 'MR_REQUEST' AND site_step."answer" = 'Not submitted')
    OR (template_step."code" = 'MATERIAL_DELIVERY' AND site_step."answer" = 'Not delivered')
  );

-- Make room immediately after BP issuance without changing existing prerequisites.
UPDATE "WorkflowTemplateStep"
SET "displayOrder" = "displayOrder" + 100
WHERE "displayOrder" >= 9;

UPDATE "WorkflowTemplateStep"
SET "displayOrder" = "displayOrder" - 98
WHERE "displayOrder" >= 109;

INSERT INTO "WorkflowTemplateStep" (
  "id", "templateId", "code", "displayOrder", "label", "prerequisiteCode", "stepType", "allowedAnswers"
)
SELECT
  gen_random_uuid()::text,
  template."id",
  'LICENSE_REQUIRED',
  9,
  'License required',
  'BP_ISSUANCE',
  'LICENSE_REQUIRED',
  '["Yes", "Requested - No"]'::jsonb
FROM "WorkflowTemplate" AS template
WHERE NOT EXISTS (
  SELECT 1
  FROM "WorkflowTemplateStep" AS existing
  WHERE existing."templateId" = template."id" AND existing."code" = 'LICENSE_REQUIRED'
);

INSERT INTO "WorkflowTemplateStep" (
  "id", "templateId", "code", "displayOrder", "label", "prerequisiteCode", "stepType", "allowedAnswers"
)
SELECT
  gen_random_uuid()::text,
  template."id",
  'LICENSE_ISSUANCE',
  10,
  'License issuance',
  'LICENSE_REQUIRED',
  'STANDARD',
  '["Done", "Not Done"]'::jsonb
FROM "WorkflowTemplate" AS template
WHERE NOT EXISTS (
  SELECT 1
  FROM "WorkflowTemplateStep" AS existing
  WHERE existing."templateId" = template."id" AND existing."code" = 'LICENSE_ISSUANCE'
);

-- Add the new branch to active workflows. Archived workflows remain historical snapshots.
INSERT INTO "SiteStep" (
  "id", "workflowId", "templateStepId", "state", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  workflow."id",
  license_step."id",
  CASE
    WHEN license_step."code" = 'LICENSE_REQUIRED' AND EXISTS (
      SELECT 1
      FROM "SiteStep" AS bp_site_step
      JOIN "WorkflowTemplateStep" AS bp_template_step
        ON bp_template_step."id" = bp_site_step."templateStepId"
      WHERE bp_site_step."workflowId" = workflow."id"
        AND bp_template_step."code" = 'BP_ISSUANCE'
        AND bp_site_step."state" IN ('COMPLETED', 'NOT_APPLICABLE')
    ) THEN 'ACTIONABLE'::"WorkflowState"
    ELSE 'LOCKED'::"WorkflowState"
  END,
  CURRENT_TIMESTAMP
FROM "SiteWorkflow" AS workflow
JOIN "WorkflowTemplateStep" AS license_step
  ON license_step."templateId" = workflow."templateId"
 AND license_step."code" IN ('LICENSE_REQUIRED', 'LICENSE_ISSUANCE')
WHERE workflow."active" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "SiteStep" AS existing
    WHERE existing."workflowId" = workflow."id"
      AND existing."templateStepId" = license_step."id"
  );

UPDATE "SiteWorkflow" AS workflow
SET "status" = 'IN_PROGRESS', "completedAt" = NULL
WHERE workflow."active" = true
  AND workflow."status" = 'COMPLETED'
  AND EXISTS (
    SELECT 1
    FROM "SiteStep" AS site_step
    JOIN "WorkflowTemplateStep" AS template_step
      ON template_step."id" = site_step."templateStepId"
    WHERE site_step."workflowId" = workflow."id"
      AND template_step."code" = 'LICENSE_REQUIRED'
      AND site_step."state" = 'ACTIONABLE'
  );
