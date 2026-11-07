BEGIN;

ALTER TABLE "SiteStep"
    ADD COLUMN "pendingSince" TIMESTAMP(3),
    ADD COLUMN "pendingSinceEstimated" BOOLEAN NOT NULL DEFAULT false;

-- A previously saved pending state proves the step was already pending at that time.
UPDATE "SiteStep"
SET "pendingSince" = "updatedAt", "pendingSinceEstimated" = true
WHERE "state" IN ('ACTIONABLE', 'BLOCKED', 'NEEDS_REVIEW');

CREATE FUNCTION track_site_step_pending_age() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."state" NOT IN ('ACTIONABLE', 'BLOCKED', 'NEEDS_REVIEW') THEN
        NEW."pendingSince" := NULL;
        NEW."pendingSinceEstimated" := false;
    ELSIF TG_OP = 'UPDATE' AND OLD."state" IN ('ACTIONABLE', 'BLOCKED', 'NEEDS_REVIEW') THEN
        NEW."pendingSince" := OLD."pendingSince";
        NEW."pendingSinceEstimated" := OLD."pendingSinceEstimated";
    ELSE
        NEW."pendingSince" := clock_timestamp() AT TIME ZONE 'UTC';
        NEW."pendingSinceEstimated" := false;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER track_site_step_pending_age
BEFORE INSERT OR UPDATE OF "state" ON "SiteStep"
FOR EACH ROW EXECUTE FUNCTION track_site_step_pending_age();

COMMIT;
