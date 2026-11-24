const accessorPattern =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\]|\["[^"]+"\]|\['[^']+'\])*$/;

const token = /[A-Za-z_][A-Za-z0-9_]*|\[(\d+)\]|\["([^"]+)"\]|\['([^']+)'\]/g;

export function pathParts(path: string) {
  if (path.length === 0 || path.length > 200 || !accessorPattern.test(path)) {
    return null;
  }

  const parts: string[] = [];
  let index = 0;
  for (const match of path.matchAll(token)) {
    if (match.index !== index) {
      return null;
    }

    parts.push(match[1] ?? match[2] ?? match[3] ?? match[0]);
    index = match.index + match[0].length;
    if (path[index] === ".") {
      index += 1;
    }
  }

  return index === path.length ? parts : null;
}

/** Reads a lodash-get path (`user.hours`, `staff.byMonth[0].label`) from a report payload. */
export function getPath(source: unknown, path: string) {
  const parts = pathParts(path);
  if (!parts) {
    return undefined;
  }

  let current: unknown = source;
  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

export const scalarAccessors = [
  ["user.hours", "Volunteer hours"],
  ["user.inKind", "Volunteer in-kind value"],
  ["user.volunteers", "Volunteers"],
  ["user.entries", "Volunteer entries"],
  ["staff.hours", "Staff hours"],
  ["staff.inKind", "Staff in-kind value"],
  ["staff.volunteers", "Staff"],
  ["staff.entries", "Staff entries"],
  ["collective.hours", "Group hours"],
  ["collective.inKind", "Group in-kind value"],
  ["collective.entries", "Group sessions"],
] as const;

export const seriesAccessors = [
  ["user.byOrganization", "Volunteer hours by organization"],
  ["user.byCategory", "Volunteer hours by task category"],
  ["user.byPerson", "Volunteer hours by person"],
  ["user.byVolunteer", "Volunteer hours by volunteer"],
  ["user.byProject", "Volunteer hours by project"],
  ["user.byMonth", "Volunteer hours by month"],
  ["staff.byOrganization", "Staff hours by organization"],
  ["staff.byCategory", "Staff hours by task category"],
  ["staff.byPerson", "Staff hours by person"],
  ["staff.byVolunteer", "Staff hours by volunteer"],
  ["staff.byProject", "Staff hours by project"],
  ["staff.byMonth", "Staff hours by month"],
  ["collective.byOrganization", "Group hours by organization"],
  ["collective.byCategory", "Group hours by task category"],
  ["collective.byProject", "Group hours by project"],
] as const;
