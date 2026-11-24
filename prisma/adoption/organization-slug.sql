BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public."Tenant" ADD COLUMN IF NOT EXISTS "slug" public.citext;
CREATE UNIQUE INDEX IF NOT EXISTS "IX_Tenant_slug"
  ON public."Tenant" ("slug") WHERE "slug" IS NOT NULL;

COMMIT;