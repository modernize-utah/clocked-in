-- Notes an organization keeps about a member. Profile notes stay the person's own.
ALTER TABLE "OrganizationMembership" ADD COLUMN "notes" TEXT;
