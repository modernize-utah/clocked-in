import { Prisma } from "@/generated/prisma/client";
import { Access } from "@/lib/api/access";
import { transaction, type Db } from "@/lib/api/db";
import { conflict, notFound, validation } from "@/lib/api/errors";
import { Body, list, page, requireString, requireUuid } from "@/lib/api/json";
import {
  canonicalConnection,
  isMemberRelationship,
  type MemberRelationship,
} from "@/lib/member-connection";
import { prisma } from "@/lib/prisma";

const userSelect = {
  id: true,
  username: true,
  email: true,
  profile: { select: { firstName: true, lastName: true, displayName: true } },
} as const;

const connectionInclude = { userA: { select: userSelect }, userB: { select: userSelect } } as const;

type ConnectionRow = Prisma.MemberConnectionGetPayload<{ include: typeof connectionInclude }>;

function personJson(user: ConnectionRow["userA"]) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.profile?.firstName ?? null,
    lastName: user.profile?.lastName ?? null,
    displayName: user.profile?.displayName ?? null,
  };
}

function connectionJson(connection: ConnectionRow) {
  return {
    id: connection.id,
    tenantId: connection.tenantId,
    userAId: connection.userAId,
    userBId: connection.userBId,
    relationship: connection.relationship,
    createdByUserId: connection.createdByUserId,
    createdAt: connection.createdAt,
    userA: personJson(connection.userA),
    userB: personJson(connection.userB),
  };
}

export function normalizeRelationship(value: string): MemberRelationship {
  const relationship = value.trim();
  if (!isMemberRelationship(relationship)) {
    validation(
      "relationship must be Parent, Child, Spouse, Sibling, Grandparent, Grandchild, Guardian, Dependent, Friend, Colleague, or Associate.",
    );
  }

  return relationship;
}

export function allowsVolunteerAdds(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>).allowVolunteersToAddVolunteers === true;
}

export type CreateConnectionRequest = {
  userId: string;
  connectedUserId: string;
  relationship: MemberRelationship;
};

export function parseCreateConnection(body: Body): CreateConnectionRequest {
  return {
    userId: requireUuid(body, "userId"),
    connectedUserId: requireUuid(body, "connectedUserId"),
    relationship: normalizeRelationship(requireString(body, "relationship")),
  };
}

export type UpdateConnectionRequest = {
  userId: string;
  relationship: MemberRelationship;
};

export function parseUpdateConnection(body: Body): UpdateConnectionRequest {
  return {
    userId: requireUuid(body, "userId"),
    relationship: normalizeRelationship(requireString(body, "relationship")),
  };
}

async function assertActiveMember(db: Db, tenantId: string, userId: string) {
  const member = await db.tenantMembership.count({ where: { tenantId, userId, isActive: true } });
  if (member === 0) {
    validation("Both people must be active members of this tenant.");
  }
}

export async function insertConnection(
  db: Db,
  input: {
    tenantId: string;
    fromUserId: string;
    toUserId: string;
    relationship: MemberRelationship;
    createdByUserId: string;
  },
) {
  const canonical = canonicalConnection(input.fromUserId, input.toUserId, input.relationship);
  if (!canonical) {
    validation("A person cannot be connected to themselves.");
  }

  const existing = await db.memberConnection.findFirst({
    where: { tenantId: input.tenantId, userAId: canonical.userAId, userBId: canonical.userBId },
    select: { id: true },
  });
  if (existing) {
    conflict("These people are already connected.");
  }

  return db.memberConnection.create({
    data: {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      userAId: canonical.userAId,
      userBId: canonical.userBId,
      relationship: canonical.relationship,
      createdByUserId: input.createdByUserId,
    },
    include: connectionInclude,
  });
}

export async function volunteerConnectedTo(access: Access, tenantId: string, otherUserId: string) {
  if (access.isApiKey || access.isSuperAdmin || access.actorUserId === otherUserId) {
    return false;
  }

  if (!(await access.isOrgVolunteer(tenantId))) {
    return false;
  }

  const { userAId, userBId } = orderPair(access.actorUserId, otherUserId);
  return (
    (await prisma.memberConnection.count({
      where: { tenantId, userAId, userBId },
    })) > 0
  );
}

export async function volunteerConnectedTenantIds(access: Access, otherUserId: string) {
  if (access.isApiKey || access.isSuperAdmin || access.actorUserId === otherUserId) {
    return [];
  }

  const rows = await prisma.memberConnection.findMany({
    where: {
      OR: [
        { userAId: access.actorUserId, userBId: otherUserId },
        { userAId: otherUserId, userBId: access.actorUserId },
      ],
    },
    select: { tenantId: true },
  });
  const ids: string[] = [];
  for (const row of rows) {
    if (await access.isOrgVolunteer(row.tenantId)) {
      ids.push(row.tenantId);
    }
  }

  return ids;
}

function orderPair(left: string, right: string) {
  return left < right ? { userAId: left, userBId: right } : { userAId: right, userBId: left };
}

export async function listConnections(access: Access, tenantId: string, params: URLSearchParams) {
  const paging = page(params);
  await access.requireTenant(tenantId, false);
  const admin = access.isSuperAdmin || (await access.isOrgAdmin(tenantId));
  const connections = await prisma.memberConnection.findMany({
    where: admin
      ? { tenantId }
      : {
          tenantId,
          OR: [{ userAId: access.actorUserId }, { userBId: access.actorUserId }],
        },
    include: connectionInclude,
    orderBy: { createdAt: "asc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(connections.map(connectionJson), paging);
}

export async function createConnection(access: Access, tenantId: string, request: CreateConnectionRequest) {
  await access.requireTenantAdmin(tenantId);
  return transaction(async (tx) => {
    await assertActiveMember(tx, tenantId, request.userId);
    await assertActiveMember(tx, tenantId, request.connectedUserId);
    const saved = await insertConnection(tx, {
      tenantId,
      fromUserId: request.userId,
      toUserId: request.connectedUserId,
      relationship: request.relationship,
      createdByUserId: access.actorUserId,
    });
    return connectionJson(saved);
  });
}

export async function updateConnection(
  access: Access,
  tenantId: string,
  connectionId: string,
  request: UpdateConnectionRequest,
) {
  await access.requireTenantAdmin(tenantId);
  const connection = await prisma.memberConnection.findFirst({ where: { id: connectionId, tenantId } });
  if (!connection) {
    notFound();
  }

  if (request.userId !== connection.userAId && request.userId !== connection.userBId) {
    validation("userId must be one of the connected people.");
  }

  const otherUserId = request.userId === connection.userAId ? connection.userBId : connection.userAId;
  const canonical = canonicalConnection(request.userId, otherUserId, request.relationship);
  if (!canonical) {
    validation("A person cannot be connected to themselves.");
  }

  const saved = await prisma.memberConnection.update({
    where: { id: connection.id },
    data: { relationship: canonical.relationship },
    include: connectionInclude,
  });
  return connectionJson(saved);
}

export async function deleteConnection(access: Access, tenantId: string, connectionId: string) {
  await access.requireTenantAdmin(tenantId);
  const connection = await prisma.memberConnection.findFirst({
    where: { id: connectionId, tenantId },
    select: { id: true },
  });
  if (!connection) {
    notFound();
  }

  await prisma.memberConnection.delete({ where: { id: connection.id } });
}
