import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { Db } from "@/lib/api/db";
import type { PortalDirectorySnapshot, PortalMembership, PortalPosition } from "@/lib/external-sync/portal-client";

/** Default permissions for portal-synced custom roles (staff-like). */
const defaultPortalRolePermissions = [
  "view_reports",
  "log_own_time",
  "log_member_time",
] as const;

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "Portal", lastName: "User" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "User" };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function isActiveMembership(row: PortalMembership) {
  if (row.suspended) return false;
  if (row.ends_on) {
    const ends = Date.parse(row.ends_on);
    if (Number.isFinite(ends) && ends < Date.now()) return false;
  }
  return true;
}

function isActivePosition(row: PortalPosition) {
  if (row.ends_on) {
    const ends = Date.parse(row.ends_on);
    if (Number.isFinite(ends) && ends < Date.now()) return false;
  }
  return true;
}

/**
 * Apply a full portal directory snapshot into a VolunTime tenant.
 * Portal society → Tenant; AOs → Organizations; positions → membership title.
 */
export async function applyPortalDirectory(
  db: Db,
  tenantId: string,
  snapshot: PortalDirectorySnapshot,
) {
  const systemRoles = await db.role.findMany({
    where: { tenantId: null },
  });
  const volunteerRole = systemRoles.find((r) => r.code === "VOLUNTEER") ?? systemRoles[0];
  const memberRole = systemRoles.find((r) => r.code === "MEMBER") ?? volunteerRole;
  if (!volunteerRole || !memberRole) {
    throw new Error("System roles are missing.");
  }

  const society = snapshot.organizations.find((o) => o.kind === "society");
  if (society) {
    await db.tenant.update({
      where: { id: tenantId },
      data: {
        externalId: society.id,
        name: society.name,
      },
    });
  }

  // Roles
  const roleByExternal = new Map<string, string>();
  for (const role of snapshot.roles) {
    const existing = await db.role.findFirst({
      where: { tenantId, externalId: role.id },
    });
    if (existing) {
      await db.role.update({
        where: { id: existing.id },
        data: { name: role.name },
      });
      roleByExternal.set(role.id, existing.id);
      continue;
    }
    const code = `portal_${role.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || randomUUID().slice(0, 8)}`;
    const created = await db.role.create({
      data: {
        id: randomUUID(),
        code,
        name: role.name,
        tenantId,
        isSystem: false,
        scope: role.scope === "self" ? "self" : role.scope === "assigned_groups" ? "assigned_groups" : "tenant",
        externalId: role.id,
        permissions: {
          create: defaultPortalRolePermissions.map((permission) => ({
            id: randomUUID(),
            permission,
            allowed: true,
          })),
        },
      },
    });
    roleByExternal.set(role.id, created.id);
  }

  // AO organizations
  const orgByExternal = new Map<string, string>();
  if (society) {
    orgByExternal.set(society.id, "__society__");
  }
  for (const org of snapshot.organizations.filter((o) => o.kind === "ao")) {
    const existing = await db.organization.findFirst({
      where: { tenantId, externalId: org.id },
    });
    if (existing) {
      await db.organization.update({
        where: { id: existing.id },
        data: { name: org.short_name || org.name },
      });
      orgByExternal.set(org.id, existing.id);
      continue;
    }
    const created = await db.organization.create({
      data: {
        tenantId,
        name: org.short_name || org.name,
        externalId: org.id,
      },
    });
    orgByExternal.set(org.id, created.id);
  }

  // People
  const userByExternal = new Map<string, string>();
  const seenUserIds = new Set<string>();
  for (const person of snapshot.people) {
    const { firstName, lastName } = splitName(person.name);
    let user = await db.user.findFirst({ where: { externalId: person.id } });
    if (!user) {
      const email = person.email.toLowerCase();
      user = await db.user.findFirst({ where: { email } });
      if (user) {
        user = await db.user.update({
          where: { id: user.id },
          data: { externalId: person.id },
        });
      }
    }
    if (!user) {
      const usernameBase = person.email
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "")
        .slice(0, 40);
      let username = usernameBase || `p-${person.id.slice(0, 8)}`;
      let n = 0;
      while (await db.user.findUnique({ where: { username } })) {
        n += 1;
        username = `${usernameBase.slice(0, 36)}${n}`;
      }
      const passwordHash = await bcrypt.hash(randomBytes(32).toString("base64url"), 10);
      user = await db.user.create({
        data: {
          username,
          email: person.email.toLowerCase(),
          passwordHash,
          externalId: person.id,
          mustChangePassword: false,
          profile: {
            create: { firstName, lastName, displayName: person.name },
          },
        },
      });
    } else {
      await db.userProfile.updateMany({
        where: { userId: user.id },
        data: { firstName, lastName, displayName: person.name },
      });
      if (person.email.toLowerCase() !== user.email) {
        user = await db.user.update({
          where: { id: user.id },
          data: { email: person.email.toLowerCase() },
        });
      }
    }
    userByExternal.set(person.id, user.id);
    if (person.active) {
      seenUserIds.add(user.id);
    }
  }

  // Memberships — pick latest non-suspended per person+org
  type MemKey = string;
  const bestMembership = new Map<MemKey, PortalMembership>();
  for (const row of snapshot.memberships) {
    if (!isActiveMembership(row)) continue;
    const key = `${row.person_id}::${row.organization_id}`;
    const prev = bestMembership.get(key);
    if (!prev) {
      bestMembership.set(key, row);
      continue;
    }
    const prevStart = Date.parse(prev.starts_on ?? "") || 0;
    const nextStart = Date.parse(row.starts_on ?? "") || 0;
    if (nextStart >= prevStart) {
      bestMembership.set(key, row);
    }
  }

  const activeTenantUserIds = new Set<string>();
  const activeOrgPairs = new Set<string>();

  for (const row of bestMembership.values()) {
    const userId = userByExternal.get(row.person_id);
    if (!userId) continue;
    const orgRef = orgByExternal.get(row.organization_id);
    if (!orgRef) continue;
    const roleId = roleByExternal.get(row.role_id) ?? volunteerRole.id;

    if (orgRef === "__society__") {
      activeTenantUserIds.add(userId);
      const existing = await db.tenantMembership.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
      });
      if (existing) {
        await db.tenantMembership.update({
          where: { id: existing.id },
          data: { roleId, isActive: true },
        });
      } else {
        await db.tenantMembership.create({
          data: { userId, tenantId, roleId, isActive: true },
        });
      }
      continue;
    }

    // Ensure tenant membership exists for AO members
    activeTenantUserIds.add(userId);
    const tm = await db.tenantMembership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (!tm) {
      await db.tenantMembership.create({
        data: { userId, tenantId, roleId: memberRole.id, isActive: true },
      });
    } else if (!tm.isActive) {
      await db.tenantMembership.update({
        where: { id: tm.id },
        data: { isActive: true },
      });
    }

    activeOrgPairs.add(`${userId}::${orgRef}`);
    const existing = await db.organizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgRef } },
    });
    if (existing) {
      await db.organizationMembership.update({
        where: { id: existing.id },
        data: { roleId },
      });
    } else {
      await db.organizationMembership.create({
        data: { userId, organizationId: orgRef, roleId },
      });
    }
  }

  // Positions → title on membership
  const titles = new Map<string, string>();
  for (const row of snapshot.positions) {
    if (!isActivePosition(row)) continue;
    const userId = userByExternal.get(row.person_id);
    const orgRef = orgByExternal.get(row.organization_id);
    if (!userId || !orgRef) continue;
    const key = `${userId}::${orgRef}`;
    titles.set(key, row.position);
  }

  for (const [key, title] of titles) {
    const [userId, orgRef] = key.split("::");
    if (orgRef === "__society__") {
      await db.tenantMembership.updateMany({
        where: { userId, tenantId },
        data: { title },
      });
      continue;
    }
    await db.organizationMembership.updateMany({
      where: { userId, organizationId: orgRef },
      data: { title },
    });
  }

  // Clear titles with no active position
  const orgMemberships = await db.organizationMembership.findMany({
    where: { organization: { tenantId } },
    select: { id: true, userId: true, organizationId: true, title: true },
  });
  for (const m of orgMemberships) {
    const key = `${m.userId}::${m.organizationId}`;
    if (m.title && !titles.has(key)) {
      await db.organizationMembership.update({
        where: { id: m.id },
        data: { title: null },
      });
    }
  }

  // Soft-deactivate tenant memberships not in snapshot
  const allTenantMemberships = await db.tenantMembership.findMany({
    where: { tenantId },
    select: { id: true, userId: true, isActive: true },
  });
  for (const m of allTenantMemberships) {
    const shouldBeActive = activeTenantUserIds.has(m.userId) && seenUserIds.has(m.userId);
    if (m.isActive && !shouldBeActive) {
      await db.tenantMembership.update({
        where: { id: m.id },
        data: { isActive: false },
      });
    }
  }

  // Remove org memberships no longer present
  for (const m of orgMemberships) {
    const key = `${m.userId}::${m.organizationId}`;
    if (!activeOrgPairs.has(key)) {
      await db.organizationMembership.delete({ where: { id: m.id } });
    }
  }

  return {
    people: snapshot.people.length,
    organizations: snapshot.organizations.filter((o) => o.kind === "ao").length,
    roles: snapshot.roles.length,
    memberships: bestMembership.size,
    positions: titles.size,
  };
}
