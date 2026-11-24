import { Prisma } from "@/generated/prisma/client";
import {
  apiKeyMatches,
  parseScopes,
  prefixOf,
  presentedApiKey,
  principalFromScopes,
  verifyDummyApiKey,
  type ApiKeyPrincipal,
} from "@/lib/api/api-key";
import { forbidden, notFound, passwordChangeRequired, unauthorized } from "@/lib/api/errors";
import { parseGuid } from "@/lib/api/guid";
import { type RoleCode } from "@/lib/api/json";
import { readAccessSubject } from "@/lib/api/security";
import {
  apiKeyPermissions,
  defaultPermissionsForCode,
  defaultScopeForCode,
  groupManagerPermissions,
  type Permission,
  type RoleScope,
} from "@/lib/permissions";
import { resolveRequestTenantSlug } from "@/lib/portal";
import { prisma } from "@/lib/prisma";

export const accountInclude = { profile: true } as const;
export type Account = Prisma.UserGetPayload<{ include: typeof accountInclude }>;
type TenantWithTheme = Prisma.TenantGetPayload<{ include: { theme: true } }>;

type CallerTenant = { isActive: boolean; role: RoleCode | null; roleId: string | null; scope: RoleScope };
type CallerOrganization = { organizationId: string; tenantId: string; isAdmin: boolean };

function roleScopeFrom(scope: string, code: string): RoleScope {
  if (scope === "tenant" || scope === "assigned_groups" || scope === "self") {
    return scope;
  }
  return defaultScopeForCode(code);
}

export class Access {
  private tenants?: Map<string, CallerTenant>;
  private organizations?: CallerOrganization[];
  private permissionSets?: Map<string, Set<Permission>>;
  private pinnedOrg?: TenantWithTheme | null;

  constructor(
    private readonly account: Account | null,
    private readonly apiKey: ApiKeyPrincipal | null = null,
    readonly tenantSlug: string | null = null,
  ) {}

  get caller(): Account {
    return this.account ?? unauthorized();
  }

  get isApiKey() {
    return this.apiKey !== null;
  }

  get isSuperAdmin() {
    return Boolean(this.account?.isSuperAdmin && !this.tenantSlug);
  }

  get actorUserId() {
    return this.account?.id ?? this.apiKey?.createdByUserId ?? unauthorized();
  }

  requireHuman() {
    return this.account ?? forbidden();
  }

  canWrite(tenantId: string) {
    return this.apiKey !== null && this.apiKey.tenantId === tenantId && this.apiKey.canWrite;
  }

  async pinnedTenant(): Promise<TenantWithTheme | null> {
    if (!this.tenantSlug) {
      return null;
    }

    if (this.pinnedOrg === undefined) {
      this.pinnedOrg = await prisma.tenant.findFirst({
        where: { slug: this.tenantSlug },
        include: { theme: true },
      });
    }

    return this.pinnedOrg ?? notFound();
  }

  async requireTenant(tenantId: string, admin: boolean) {
    const pinned = await this.pinnedTenant();
    if (pinned && pinned.id !== tenantId) {
      notFound();
    }

    const tenant =
      pinned ??
      (await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { theme: true },
      }));
    if (!tenant) {
      notFound();
    }

    if (this.apiKey) {
      if (this.apiKey.tenantId !== tenantId) {
        forbidden();
      }

      if (admin ? !this.apiKey.canWrite : !this.apiKey.canRead) {
        forbidden();
      }

      return tenant;
    }

    if (this.isSuperAdmin && !pinned) {
      return tenant;
    }

    const membership = (await this.tenantMemberships()).get(tenantId);
    if (!membership || !membership.isActive || (admin && !(await this.can(tenantId, "manage_tenant")))) {
      if (!membership?.isActive && this.isSuperAdmin && !pinned) {
        return tenant;
      }
      forbidden();
    }

    return tenant;
  }

  async requireTenantAdmin(tenantId: string) {
    const tenant = await this.requireTenant(tenantId, true);
    if (this.apiKey && !this.apiKey.isAdmin) {
      forbidden();
    }

    return tenant;
  }

  async requireOrganization(organizationId: string) {
    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      notFound();
    }

    await this.requireTenant(organization.tenantId, false);
    return organization;
  }

  async requireOrganizationManager(organizationId: string) {
    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      notFound();
    }

    const pinned = await this.pinnedTenant();
    if (pinned && pinned.id !== organization.tenantId) {
      notFound();
    }

    if (
      !(this.isSuperAdmin && !pinned) &&
      !(await this.can(organization.tenantId, "manage_tenant")) &&
      !(await this.can(organization.tenantId, "invite_members", organizationId)) &&
      !(await this.isOrganizationAdmin(organizationId))
    ) {
      forbidden();
    }

    return organization;
  }

  async can(tenantId: string, permission: Permission, organizationId?: string | null) {
    if (this.isSuperAdmin && !this.tenantSlug) {
      return true;
    }

    if (this.apiKey) {
      if (this.apiKey.tenantId !== tenantId) {
        return false;
      }
      return apiKeyPermissions(this.apiKey.isAdmin, this.apiKey.canWrite).includes(permission);
    }

    const membership = (await this.tenantMemberships()).get(tenantId);
    if (!membership?.isActive) {
      return this.isSuperAdmin && !this.tenantSlug;
    }

    if (this.isSuperAdmin) {
      return true;
    }

    const granted = await this.permissionsFor(tenantId);
    if (!granted.has(permission)) {
      return false;
    }

    if (organizationId && groupManagerPermissions.includes(permission) && membership.role !== "ADMIN") {
      return this.isOrganizationAdmin(organizationId);
    }

    return true;
  }

  /** Saving report designs: an admin API key, or a person with manage_tenant or design_reports. */
  async requireReportDesigner(tenantId: string) {
    if (this.apiKey) {
      return this.requireTenantAdmin(tenantId);
    }

    const tenant = await this.requireTenant(tenantId, false);
    if (!(await this.can(tenantId, "manage_tenant")) && !(await this.can(tenantId, "design_reports"))) {
      forbidden();
    }
    return tenant;
  }

  async requirePermission(tenantId: string, permission: Permission, organizationId?: string | null) {
    const tenant = await this.requireTenant(tenantId, false);
    if (!(await this.can(tenantId, permission, organizationId))) {
      forbidden();
    }
    return tenant;
  }

  async permissionsFor(tenantId: string) {
    if (!this.permissionSets) {
      this.permissionSets = new Map();
    }

    const cached = this.permissionSets.get(tenantId);
    if (cached) {
      return cached;
    }

    const membership = (await this.tenantMemberships()).get(tenantId);
    if (this.isSuperAdmin && (!this.tenantSlug || membership?.isActive)) {
      const all = new Set(apiKeyPermissions(true, true));
      this.permissionSets.set(tenantId, all);
      return all;
    }

    if (this.apiKey) {
      const granted = new Set(apiKeyPermissions(this.apiKey.isAdmin, this.apiKey.canWrite));
      this.permissionSets.set(tenantId, granted);
      return granted;
    }

    if (!membership?.isActive) {
      const none = new Set<Permission>();
      this.permissionSets.set(tenantId, none);
      return none;
    }

    const granted = new Set<Permission>(defaultPermissionsForCode(membership?.role));
    if (membership?.roleId) {
      const rows = await prisma.rolePermission.findMany({
        where: { roleId: membership.roleId, allowed: true },
        select: { permission: true },
      });
      if (rows.length > 0) {
        granted.clear();
        for (const row of rows) {
          if (apiKeyPermissions(true, true).includes(row.permission as Permission)) {
            granted.add(row.permission as Permission);
          }
        }
      }
    }

    if ((await this.adminOrganizationIds(tenantId)).length > 0) {
      for (const permission of groupManagerPermissions) {
        granted.add(permission);
      }
    }

    this.permissionSets.set(tenantId, granted);
    return granted;
  }

  async isOrgAdmin(tenantId: string) {
    return this.can(tenantId, "manage_tenant");
  }

  async isActiveMember(tenantId: string) {
    if (this.apiKey) {
      return this.apiKey.tenantId === tenantId;
    }

    return (await this.tenantMemberships()).get(tenantId)?.isActive === true;
  }

  async isOrgVolunteer(tenantId: string) {
    if (this.apiKey) {
      return false;
    }

    const membership = (await this.tenantMemberships()).get(tenantId);
    return membership !== undefined && membership.isActive && membership.role === "VOLUNTEER";
  }

  async tenantRole(tenantId: string) {
    const membership = (await this.tenantMemberships()).get(tenantId);
    return membership?.isActive ? membership.role : null;
  }

  async tenantsWhereCallerCanReadOthers() {
    const ids: string[] = [];
    for (const [tenantId, membership] of await this.tenantMemberships()) {
      if (!membership.isActive) continue;
      if (
        (await this.can(tenantId, "log_member_time")) ||
        (await this.can(tenantId, "view_reports")) ||
        (await this.can(tenantId, "manage_members"))
      ) {
        ids.push(tenantId);
      }
    }
    return ids;
  }

  async isOrganizationAdmin(organizationId: string) {
    const organization = (await this.organizationMemberships()).find((item) => item.organizationId === organizationId);
    if (!organization || !organization.isAdmin) {
      return false;
    }

    return (await this.tenantMemberships()).get(organization.tenantId)?.isActive === true;
  }

  async roleScope(tenantId: string): Promise<RoleScope> {
    const membership = (await this.tenantMemberships()).get(tenantId);
    return membership?.scope ?? defaultScopeForCode(membership?.role);
  }

  async assignedOrganizationIds(tenantId: string) {
    const membership = (await this.tenantMemberships()).get(tenantId);
    if (!membership?.isActive) {
      return [];
    }

    return (await this.organizationMemberships())
      .filter((item) => item.tenantId === tenantId)
      .map((item) => item.organizationId);
  }

  async visibility(tenantId: string): Promise<
    { kind: "all" } | { kind: "organizations"; organizationIds: string[] } | { kind: "self" }
  > {
    if (this.isSuperAdmin || this.isApiKey || (await this.isOrgAdmin(tenantId))) {
      return { kind: "all" };
    }

    const scope = await this.roleScope(tenantId);
    if (scope === "assigned_groups") {
      return { kind: "organizations", organizationIds: await this.assignedOrganizationIds(tenantId) };
    }

    const adminOrganizations = await this.adminOrganizationIds(tenantId);
    if (adminOrganizations.length > 0) {
      return { kind: "organizations", organizationIds: adminOrganizations };
    }

    if (scope === "self" || (await this.isOrgVolunteer(tenantId))) {
      return { kind: "self" };
    }

    return { kind: "all" };
  }

  async adminOrganizationIds(tenantId: string) {
    const membership = (await this.tenantMemberships()).get(tenantId);
    if (!membership?.isActive) {
      return [];
    }

    return (await this.organizationMemberships())
      .filter((item) => item.tenantId === tenantId && item.isAdmin)
      .map((item) => item.organizationId);
  }

  async activeTenantIds() {
    return [...(await this.tenantMemberships()).entries()]
      .filter(([, membership]) => membership.isActive)
      .map(([tenantId]) => tenantId);
  }

  async organizationIds() {
    return (await this.organizationMemberships()).map((item) => item.organizationId);
  }

  async sharedTenantIds(otherUserId: string) {
    const tenantIds = await this.activeTenantIds();
    if (tenantIds.length === 0) {
      return [];
    }

    const shared = await prisma.tenantMembership.findMany({
      where: { userId: otherUserId, tenantId: { in: tenantIds } },
      select: { tenantId: true },
    });
    return shared.map((membership) => membership.tenantId);
  }

  private async tenantMemberships(): Promise<Map<string, CallerTenant>> {
    if (this.tenants) {
      return this.tenants;
    }

    const pinned = await this.pinnedTenant();
    if (this.apiKey) {
      const tenants =
        !pinned || this.apiKey.tenantId === pinned.id
          ? new Map<string, CallerTenant>([
              [
                this.apiKey.tenantId,
                { isActive: true, role: this.apiKey.isAdmin ? "ADMIN" : "MEMBER", roleId: null, scope: "tenant" },
              ],
            ])
          : new Map<string, CallerTenant>();
      this.tenants = tenants;
      return tenants;
    }

    const tenants = new Map<string, CallerTenant>(
      (
        await prisma.tenantMembership.findMany({
          where: { userId: this.caller.id, ...(pinned ? { tenantId: pinned.id } : {}) },
          select: { tenantId: true, isActive: true, roleId: true, role: { select: { code: true, scope: true } } },
        })
      ).map((membership) => [
        membership.tenantId,
        {
          isActive: membership.isActive,
          roleId: membership.roleId,
          role: membership.role.code || null,
          scope: roleScopeFrom(membership.role.scope, membership.role.code),
        },
      ]),
    );
    this.tenants = tenants;
    return tenants;
  }

  private async organizationMemberships() {
    if (this.organizations) {
      return this.organizations;
    }

    const pinned = await this.pinnedTenant();
    if (this.apiKey) {
      const key = this.apiKey;
      if (pinned && key.tenantId !== pinned.id) {
        this.organizations = [];
        return this.organizations;
      }

      const organizations = await prisma.tenant.findMany({
        where: { tenantId: key.tenantId },
        select: { id: true, tenantId: true },
      });
      this.organizations = organizations.map((organization) => ({
        organizationId: organization.id,
        tenantId: organization.tenantId,
        isAdmin: key.canWrite,
      }));
      return this.organizations;
    }

    this.organizations = (
      await prisma.tenantMembership.findMany({
        where: { userId: this.caller.id, ...(pinned ? { organization: { tenantId: pinned.id } } : {}) },
        select: { organizationId: true, organization: { select: { tenantId: true } }, role: { select: { code: true } } },
      })
    ).map((membership) => ({
      organizationId: membership.organizationId,
      tenantId: membership.organization.tenantId,
      isAdmin: membership.role.code === "ADMIN",
    }));
    return this.organizations;
  }
}

export async function accessForSubject(subject: string, tenantSlug?: string | null) {
  const id = parseGuid(subject);
  if (!id) {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id }, include: accountInclude });
  return user ? new Access(user, null, tenantSlug?.trim().toLowerCase() || null) : null;
}

async function authenticateApiKey(raw: string, tenantSlug: string | null) {
  const prefix = prefixOf(raw);
  if (!prefix) {
    verifyDummyApiKey(raw);
    unauthorized();
  }

  const keys = await prisma.tenantApiKey.findMany({ where: { prefix, revokedAt: null } });
  const match = keys.find((item) => apiKeyMatches(raw, item.keyHash));
  if (!match) {
    verifyDummyApiKey(raw);
    unauthorized();
  }

  if (match.expiresAt && match.expiresAt.getTime() <= Date.now()) {
    unauthorized();
  }

  try {
    await prisma.tenantApiKey.update({ where: { id: match.id }, data: { lastUsedAt: new Date() } });
  } catch (error) {
    console.warn("Could not record API key last-used time.", error);
  }

  return new Access(null, principalFromScopes(match, parseScopes(match.scopes)), tenantSlug);
}

export async function authenticate(request: Request, options?: { allowPasswordChange?: boolean }) {
  const tenantSlug = resolveRequestTenantSlug(request.headers);
  const rawKey = presentedApiKey(request);
  if (rawKey) {
    return authenticateApiKey(rawKey, tenantSlug);
  }

  const subject = await readAccessSubject(request);
  if (!parseGuid(subject)) {
    unauthorized();
  }

  const access =
    (await accessForSubject(subject, tenantSlug)) ?? unauthorized("This token is not valid for this server.");
  if (access.caller.mustChangePassword && !options?.allowPasswordChange) {
    passwordChangeRequired();
  }

  return access;
}
