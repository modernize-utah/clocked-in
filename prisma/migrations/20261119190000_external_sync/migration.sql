-- External sync secrets and last-pulled watermarks on Organization.
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "peopleRoleOutboundTokenEnc" TEXT,
  ADD COLUMN IF NOT EXISTS "peopleRoleWebhookSecretEnc" TEXT,
  ADD COLUMN IF NOT EXISTS "peopleRoleLastPulledAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "organizationGroupOutboundTokenEnc" TEXT,
  ADD COLUMN IF NOT EXISTS "organizationGroupWebhookSecretEnc" TEXT,
  ADD COLUMN IF NOT EXISTS "organizationGroupLastPulledAt" TIMESTAMPTZ(6);

-- External ids for synced roles and departments.
ALTER TABLE "Role"
  ADD COLUMN IF NOT EXISTS "externalId" TEXT;

ALTER TABLE "Department"
  ADD COLUMN IF NOT EXISTS "externalId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Role_org_externalId_key"
  ON "Role" ("organizationId", "externalId")
  WHERE "organizationId" IS NOT NULL AND "externalId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Department_org_externalId_key"
  ON "Department" ("organizationId", "externalId")
  WHERE "externalId" IS NOT NULL;
