-- Per-workspace rules for filling an event's date windows from its ad spend.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "registry_date_rules" jsonb;
