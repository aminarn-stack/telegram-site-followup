UPDATE "WorkflowTemplateStep"
SET "allowedAnswers" = "allowedAnswers" || jsonb_build_array('Done - All previous steps considered as Done')
WHERE "code" = 'BP_ISSUANCE'
  AND NOT ("allowedAnswers" ? 'Done - All previous steps considered as Done');
