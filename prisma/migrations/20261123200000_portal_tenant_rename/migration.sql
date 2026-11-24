-- Portal-aligned rename: Organization→Tenant, Department→Organization
-- Order avoids table name collisions.

-- 1) Rename top-level org table first so "Organization" is free for departments.
ALTER TABLE "Organization" RENAME TO "Tenant";
ALTER TABLE "OrganizationMembership" RENAME TO "TenantMembership";
ALTER TABLE "OrganizationApiKey" RENAME TO "TenantApiKey";
ALTER TABLE "Department" RENAME TO "Organization";
ALTER TABLE "DepartmentMembership" RENAME TO "OrganizationMembership";

-- 2) TenantMembership columns (was OrganizationMembership)
ALTER TABLE "TenantMembership" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "TenantMembership" RENAME COLUMN "primaryDepartmentId" TO "primaryOrganizationId";
ALTER TABLE "TenantMembership" RENAME COLUMN "orgUserTitle" TO "title";
ALTER TABLE "TenantMembership" RENAME COLUMN "orgUserDescription" TO "memberDescription";

-- 3) Organization (was Department): organizationId → tenantId
ALTER TABLE "Organization" RENAME COLUMN "organizationId" TO "tenantId";

-- 4) OrganizationMembership (was DepartmentMembership): departmentId → organizationId
ALTER TABLE "OrganizationMembership" RENAME COLUMN "departmentId" TO "organizationId";
ALTER TABLE "OrganizationMembership" ADD COLUMN IF NOT EXISTS "title" TEXT;

-- 5) TenantApiKey
ALTER TABLE "TenantApiKey" RENAME COLUMN "organizationId" TO "tenantId";

-- 6) All other organizationId → tenantId (tables that pointed at the old Organization/Tenant)
ALTER TABLE "Role" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "Tag" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "TaskCategory" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "Project" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "Project" RENAME COLUMN "departmentId" TO "organizationId";
ALTER TABLE "UserTimeEntry" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "UserTimeEntry" RENAME COLUMN "departmentId" TO "organizationId";
ALTER TABLE "CollectiveTimeEntry" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "CollectiveTimeEntry" RENAME COLUMN "departmentId" TO "organizationId";
ALTER TABLE "Invitation" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "Invitation" RENAME COLUMN "departmentId" TO "organizationId";
ALTER TABLE "HourlyRate" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "Theme" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "Feedback" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "MemberConnection" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "Report" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "EmailTemplate" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "ReportTemplate" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "AccessRequest" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "AccessRequest" RENAME COLUMN "requestedDepartmentIds" TO "requestedOrganizationIds";
ALTER TABLE "VolunteerNeed" RENAME COLUMN "organizationId" TO "tenantId";
ALTER TABLE "VolunteerNeed" RENAME COLUMN "departmentId" TO "organizationId";

-- 7) User + Tenant external ids
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "IX_User_externalId" ON "User" ("externalId") WHERE "externalId" IS NOT NULL;

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "IX_Tenant_externalId" ON "Tenant" ("externalId") WHERE "externalId" IS NOT NULL;

-- 8) Portal secret columns; drop legacy dual sync columns
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "portalClientId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "portalClientSecretEnc" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "portalApiTokenEnc" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "portalWebhookSecretEnc" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "portalLastPulledAt" TIMESTAMPTZ(6);

ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "peopleRoleOutboundTokenEnc";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "peopleRoleWebhookSecretEnc";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "peopleRoleLastPulledAt";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "organizationGroupOutboundTokenEnc";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "organizationGroupWebhookSecretEnc";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "organizationGroupLastPulledAt";

-- 9) Permission / scope / accessType string renames
UPDATE "RolePermission" SET permission = 'manage_tenant' WHERE permission = 'manage_organization';
UPDATE "Role" SET scope = 'tenant' WHERE scope = 'organization';

ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_access_check";
UPDATE "Project" SET "accessType" = 'Tenant' WHERE "accessType" = 'Organization';
UPDATE "Project" SET "accessType" = 'Organization' WHERE "accessType" = 'Department';
ALTER TABLE "Project" ADD CONSTRAINT "Project_access_check" CHECK (
  ("projectType" = ANY (ARRAY['Project'::text, 'Event'::text]))
  AND ("accessType" = ANY (ARRAY['Public'::text, 'Private'::text, 'Tenant'::text, 'Organization'::text]))
  AND (
    (("accessType" = 'Organization'::text) AND ("organizationId" IS NOT NULL))
    OR (("accessType" = ANY (ARRAY['Public'::text, 'Private'::text, 'Tenant'::text])) AND ("organizationId" IS NULL))
  )
  AND (("startDate" IS NULL) OR ("endDate" IS NULL) OR ("endDate" >= "startDate"))
);
