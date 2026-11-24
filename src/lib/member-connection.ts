import { formatPersonName } from "@/lib/format";

export const memberRelationships = [
  "Parent",
  "Child",
  "Spouse",
  "Sibling",
  "Grandparent",
  "Grandchild",
  "Guardian",
  "Dependent",
  "Friend",
  "Colleague",
  "Associate",
] as const;

export type MemberRelationship = (typeof memberRelationships)[number];

const inverse: Record<MemberRelationship, MemberRelationship> = {
  Parent: "Child",
  Child: "Parent",
  Spouse: "Spouse",
  Sibling: "Sibling",
  Grandparent: "Grandchild",
  Grandchild: "Grandparent",
  Guardian: "Dependent",
  Dependent: "Guardian",
  Friend: "Friend",
  Colleague: "Colleague",
  Associate: "Associate",
};

export function isMemberRelationship(value: string): value is MemberRelationship {
  return (memberRelationships as readonly string[]).includes(value);
}

export function inverseRelationship(relationship: MemberRelationship) {
  return inverse[relationship];
}

export function orderUserIds(left: string, right: string) {
  return left < right ? { userAId: left, userBId: right } : { userAId: right, userBId: left };
}

export function canonicalConnection(fromUserId: string, toUserId: string, relationship: MemberRelationship) {
  if (fromUserId === toUserId) {
    return null;
  }

  if (fromUserId < toUserId) {
    return { userAId: fromUserId, userBId: toUserId, relationship };
  }

  return { userAId: toUserId, userBId: fromUserId, relationship: inverseRelationship(relationship) };
}

export function relationshipFor(
  connection: { userAId: string; userBId: string; relationship: string },
  viewerId: string,
) {
  if (!isMemberRelationship(connection.relationship)) {
    return connection.relationship;
  }

  if (viewerId === connection.userBId) {
    return inverseRelationship(connection.relationship);
  }

  return connection.relationship;
}

export type ConnectionPerson = {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
};

export type MemberConnectionRecord = {
  id: string;
  tenantId: string;
  userAId: string;
  userBId: string;
  relationship: string;
  createdByUserId: string;
  createdAt: string;
  userA: ConnectionPerson;
  userB: ConnectionPerson;
};

export function connectionPersonName(user: {
  username: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  return formatPersonName(user);
}
