-- Link to each client's assets doc or folder, shown on the Assets page.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "assets_url" text;
