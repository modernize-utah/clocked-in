import { Prisma } from "@/generated/prisma/client";
import { Access } from "@/lib/api/access";
import { forbidden } from "@/lib/api/errors";
import { cents, hoursFromMinutes, inKindFromMinutes, queryDate, queryUuids } from "@/lib/api/json";
import { labels } from "@/lib/labels";
import { readPreferences } from "@/lib/api/features/organizations";
import { prisma } from "@/lib/prisma";

/** Task category whose hours count as participation, not volunteering, in the volunteer table. Matches Reports.cs. */
export const participantHoursCategory = "participant hours";

type Filter = {
  departmentIds?: string[];
  taskCategoryIds?: string[];
  projectIds?: string[];
  userIds?: string[];
  from?: Date;
  to?: Date;
};

function parseFilter(params: URLSearchParams): Filter {
  return {
    departmentIds: queryUuids(params, "departmentId"),
    taskCategoryIds: queryUuids(params, "taskCategoryId"),
    projectIds: queryUuids(params, "projectId"),
    userIds: queryUuids(params, "userId"),
    from: queryDate(params, "from"),
    to: queryDate(params, "to"),
  };
}

function idsWhere(ids: string[] | undefined) {
  return ids ? { in: ids } : undefined;
}

type Person = {
  username: string;
  profile: { displayName: string | null; firstName: string; lastName: string } | null;
};

function personLabel(person: Person) {
  const profile = person.profile;
  if (profile?.displayName && profile.displayName.trim().length > 0) {
    return profile.displayName.trim();
  }

  const name = profile ? `${profile.firstName} ${profile.lastName}`.trim() : "";
  if (name.length > 0) {
    return name;
  }

  if (profile && profile.firstName === "" && profile.lastName === "") {
    return "";
  }

  return person.username;
}

const personSelect = {
  username: true,
  profile: { select: { displayName: true, firstName: true, lastName: true } },
} as const;

type BucketRow = {
  id: string;
  label: string;
  projectType?: string;
  minutes: number;
  volunteers: number;
  entries: number;
  inKindCents: number;
};

function ordinal(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sorted(rows: BucketRow[]) {
  return rows
    .map((row) => ({
      id: row.id,
      label: row.label,
      hours: hoursFromMinutes(row.minutes),
      volunteers: row.volunteers,
      entries: row.entries,
      inKind: row.inKindCents / 100,
      ...(row.projectType ? { projectType: row.projectType } : {}),
    }))
    .sort((a, b) => b.hours - a.hours || ordinal(a.label, b.label) || ordinal(a.id, b.id));
}

function userWhere(
  organizationId: string,
  filter: Filter,
  rateType?: "Volunteer" | "Professional",
): Prisma.UserTimeEntryWhereInput {
  return {
    organizationId,
    departmentId: idsWhere(filter.departmentIds),
    taskCategoryId: idsWhere(filter.taskCategoryIds),
    projectId: idsWhere(filter.projectIds),
    userId: idsWhere(filter.userIds),
    occurredOn: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
    ...(rateType === "Professional"
      ? { rate: { type: "Professional" } }
      : rateType === "Volunteer"
        ? { OR: [{ hourlyRateId: null }, { rate: { type: "Volunteer" } }] }
        : {}),
  };
}

type GroupRow = {
  userId: string;
  _count: { _all: number };
  _sum: { durationMinutes: number | null; inKindValue: Prisma.Decimal | null };
};

function bucketsFrom<T extends GroupRow>(
  groups: T[],
  keyOf: (group: T) => string | null,
  describe: (key: string | null) => { id: string; label: string; projectType?: string },
) {
  const rows = new Map<string | null, BucketRow & { users: Set<string> }>();
  for (const group of groups) {
    const key = keyOf(group);
    let row = rows.get(key);
    if (!row) {
      row = { ...describe(key), minutes: 0, volunteers: 0, entries: 0, inKindCents: 0, users: new Set() };
      rows.set(key, row);
    }

    row.minutes += group._sum.durationMinutes ?? 0;
    row.entries += group._count._all;
    row.inKindCents += group._sum.inKindValue === null ? 0 : cents(group._sum.inKindValue);
    row.users.add(group.userId);
  }

  return [...rows.values()].map(({ users, ...row }) => ({ ...row, volunteers: users.size }));
}

function namesById<T extends { id: string }>(rows: T[], label: (row: T) => string) {
  return new Map(rows.map((row) => [row.id, label(row)]));
}

async function userRollup(organizationId: string, filter: Filter, rateType: "Volunteer" | "Professional" = "Volunteer") {
  const where = userWhere(organizationId, filter, rateType);
  const aggregate = { _count: { _all: true }, _sum: { durationMinutes: true, inKindValue: true } } as const;
  const [byUser, byDepartment, byCategory, byProject] = await Promise.all([
    prisma.userTimeEntry.groupBy({ by: ["userId"], where, ...aggregate }),
    prisma.userTimeEntry.groupBy({ by: ["departmentId", "userId"], where, ...aggregate }),
    prisma.userTimeEntry.groupBy({ by: ["taskCategoryId", "userId"], where, ...aggregate }),
    prisma.userTimeEntry.groupBy({ by: ["projectId", "userId"], where, ...aggregate }),
  ]);
  const ids = (values: (string | null)[]) => [...new Set(values.filter((value): value is string => value !== null))];
  const [users, departments, categories, projects] = await Promise.all([
    prisma.user
      .findMany({ where: { id: { in: ids(byUser.map((g) => g.userId)) } }, select: { id: true, ...personSelect } })
      .then((rows) => namesById(rows, personLabel)),
    prisma.department
      .findMany({ where: { id: { in: ids(byDepartment.map((g) => g.departmentId)) } }, select: { id: true, name: true } })
      .then((rows) => namesById(rows, (row) => row.name)),
    prisma.taskCategory
      .findMany({ where: { id: { in: ids(byCategory.map((g) => g.taskCategoryId)) } }, select: { id: true, name: true } })
      .then((rows) => namesById(rows, (row) => row.name)),
    prisma.project
      .findMany({
        where: { id: { in: ids(byProject.map((g) => g.projectId)) } },
        select: { id: true, title: true, projectType: true },
      })
      .then((rows) => new Map(rows.map((row) => [row.id, row]))),
  ]);

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true },
  });
  const [byMonth, byUserCategory] = await Promise.all([
    prisma.userTimeEntry.groupBy({ by: ["occurredOn"], where, ...aggregate }),
    prisma.userTimeEntry.groupBy({ by: ["userId", "taskCategoryId"], where, ...aggregate }),
  ]);
  const people = bucketsFrom(byUser, (g) => g.userId, (key) => ({ id: key!, label: users.get(key!) ?? "" }));
  const named = people.filter((row) => row.label.trim().length > 0);
  const participantIds = new Set(
    [...categories.entries()].filter(([, name]) => name.toLowerCase() === participantHoursCategory).map(([id]) => id),
  );
  const volunteerHours = new Map<string, number>();
  for (const group of byUserCategory) {
    if (group.taskCategoryId !== null && participantIds.has(group.taskCategoryId)) {
      continue;
    }

    volunteerHours.set(group.userId, (volunteerHours.get(group.userId) ?? 0) + (group._sum.durationMinutes ?? 0));
  }

  const months = new Map<string, BucketRow>();
  for (const group of byMonth) {
    const date = group.occurredOn;
    const id = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    const bucket = months.get(id) ?? { id, label, minutes: 0, volunteers: 0, entries: 0, inKindCents: 0 };
    bucket.minutes += group._sum.durationMinutes ?? 0;
    bucket.entries += group._count._all;
    bucket.inKindCents += group._sum.inKindValue === null ? 0 : cents(group._sum.inKindValue);
    months.set(id, bucket);
  }

  return {
    hours: hoursFromMinutes(people.reduce((sum, row) => sum + row.minutes, 0)),
    volunteers: named.length,
    entries: people.reduce((sum, row) => sum + row.entries, 0),
    inKind: people.reduce((sum, row) => sum + row.inKindCents, 0) / 100,
    byDepartment: sorted(
      bucketsFrom(
        byDepartment,
        (g) => g.departmentId,
        (key) =>
          key === null ? { id: "organization", label: organization.name } : { id: key, label: departments.get(key) ?? "" },
      ),
    ),
    byCategory: sorted(
      bucketsFrom(
        byCategory,
        (g) => g.taskCategoryId,
        (key) => (key ? { id: key, label: categories.get(key) ?? "" } : { id: "unclassified", label: "Unclassified" }),
      ),
    ),
    byPerson: sorted(people.filter((row) => row.label.trim().length > 0)),
    byVolunteer: sorted(
      people
        .filter((row) => row.label.trim().length > 0)
        .map((row) => ({ ...row, minutes: volunteerHours.get(row.id) ?? 0 })),
    ),
    byProject: sorted(
      bucketsFrom(byProject, (g) => g.projectId, (key) => {
        if (!key) return { id: "unclassified", label: "Unclassified" };
        const project = projects.get(key);
        return { id: key, label: project?.title ?? "", projectType: project?.projectType };
      }),
    ),
    byMonth: [...months.values()]
      .sort((a, b) => ordinal(a.id, b.id))
      .map((row) => ({
        id: row.id,
        label: row.label,
        hours: hoursFromMinutes(row.minutes),
        volunteers: row.volunteers,
        entries: row.entries,
        inKind: row.inKindCents / 100,
      })),
  };
}

async function collectiveRollup(organizationId: string, filter: Filter) {
  const to = filter.to ? new Date(filter.to.getTime() + 24 * 60 * 60 * 1000) : undefined;
  const entries = await prisma.collectiveTimeEntry.findMany({
    where: {
      organizationId,
      departmentId: idsWhere(filter.departmentIds),
      taskCategoryId: idsWhere(filter.taskCategoryIds),
      projectId: idsWhere(filter.projectIds),
      OR: [{ hourlyRateId: null }, { rate: { type: "Volunteer" } }],
      startedAt: filter.from || to ? { gte: filter.from, lt: to } : undefined,
    },
    select: {
      startedAt: true,
      endedAt: true,
      inKindValue: true,
      departmentId: true,
      department: { select: { name: true } },
      taskCategoryId: true,
      taskCategory: { select: { name: true } },
      projectId: true,
      project: { select: { title: true, projectType: true } },
    },
  });
  const rows = entries.map((entry) => ({
    minutes: Math.round((entry.endedAt.getTime() - entry.startedAt.getTime()) / 60000),
    inKindCents: cents(entry.inKindValue),
    department: entry.departmentId
      ? { id: entry.departmentId, label: entry.department!.name }
      : { id: "organization", label: "Organization" },
    category: { id: entry.taskCategoryId, label: entry.taskCategory.name },
    project: { id: entry.projectId, label: entry.project.title, projectType: entry.project.projectType },
  }));
  type Row = (typeof rows)[number];
  const group = (describe: (row: Row) => { id: string; label: string; projectType?: string }) => {
    const buckets = new Map<string, BucketRow>();
    for (const row of rows) {
      const described = describe(row);
      const bucket = buckets.get(described.id) ?? {
        id: described.id,
        label: described.label,
        projectType: described.projectType,
        minutes: 0,
        volunteers: 0,
        entries: 0,
        inKindCents: 0,
      };
      bucket.minutes += row.minutes;
      bucket.entries += 1;
      bucket.inKindCents += row.inKindCents;
      buckets.set(described.id, bucket);
    }

    return sorted([...buckets.values()]);
  };

  return {
    hours: hoursFromMinutes(rows.reduce((sum, row) => sum + row.minutes, 0)),
    entries: rows.length,
    inKind: rows.reduce((sum, row) => sum + row.inKindCents, 0) / 100,
    byDepartment: group((row) => row.department),
    byCategory: group((row) => row.category),
    byProject: group((row) => row.project),
  };
}

async function forCaller(access: Access, organizationId: string, filter: Filter) {
  const visibility = await access.visibility(organizationId);
  if (visibility.kind === "all") {
    return filter;
  }

  if (visibility.kind === "departments") {
    if (filter.departmentIds) {
      if (filter.departmentIds.some((id) => !visibility.departmentIds.includes(id))) {
        forbidden();
      }

      return filter;
    }

    return { ...filter, departmentIds: visibility.departmentIds };
  }

  if (filter.userIds?.some((id) => id !== access.actorUserId)) {
    forbidden();
  }

  return { ...filter, userIds: [access.actorUserId] };
}

export async function report(access: Access, organizationId: string, params: URLSearchParams) {
  const parsed = parseFilter(params);
  await access.requireOrganization(organizationId, false);
  const filter = await forCaller(access, organizationId, parsed);
  return {
    user: await userRollup(organizationId, filter, "Volunteer"),
    staff: await userRollup(organizationId, filter, "Professional"),
    collective: await collectiveRollup(organizationId, filter),
  };
}

function hoursCell(minutes: number) {
  return String(Number(hoursFromMinutes(minutes).toFixed(5)));
}

function sheetDate(value: Date) {
  return `${value.getUTCMonth() + 1}/${value.getUTCDate()}/${value.getUTCFullYear()}`;
}

function sheetTime(value: Date | null) {
  if (!value) {
    return "";
  }

  const hours = value.getUTCHours();
  const minutes = value.getUTCMinutes();
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function sheetDuration(minutes: number | null) {
  if (minutes === null) {
    return "";
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}:${String(rest).padStart(2, "0")}`;
}

function entryMethod(mode: string, startedAt: Date | null, endedAt: Date | null) {
  if (mode === "Total") {
    return "Total Hours";
  }

  return (startedAt && endedAt) || mode === "Punch" ? "Start / End Time" : "Duration";
}

function csvCell(text: string) {
  let value = text;
  if (value.length > 0 && "=+-@\t\r".includes(value[0])) {
    value = `'${value}`;
  }

  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csvResponse(lines: string[]) {
  return new Response(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8" } });
}

export async function csv(access: Access, organizationId: string, params: URLSearchParams) {
  const organization = await access.requireOrganization(organizationId, false);
  const filter = await forCaller(access, organizationId, parseFilter(params));
  const copy = labels(readPreferences(organization.preferences));
  const header = [
    "Date",
    copy.project,
    "Volunteer",
    `${copy.department} / ${copy.organization}`,
    copy.taskCategory,
    "Entry Method",
    "Start Time",
    "End Time",
    "Manual Duration",
    "Hours",
    "Rate Type",
    "Hourly Rate",
    "In-Kind Value",
    "Tags",
    "Entered By",
    "Date Entered",
    "Hour Attribution",
    "Notes",
    "Volunteer ID",
  ].join(",");
  const entries = await prisma.userTimeEntry.findMany({
    where: { ...userWhere(organizationId, filter), NOT: { rate: { type: "Paid" } } },
    orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }],
    select: {
      occurredOn: true,
      project: { select: { title: true } },
      user: { select: { ...personSelect, profile: { select: { ...personSelect.profile.select, memberNumber: true } } } },
      department: { select: { name: true } },
      organization: { select: { name: true } },
      taskCategory: { select: { name: true } },
      mode: true,
      startedAt: true,
      endedAt: true,
      durationMinutes: true,
      hourlyRate: true,
      inKindValue: true,
      rate: { select: { name: true } },
      tags: { select: { tag: { select: { name: true } } } },
      enteredBy: { select: personSelect },
      createdAt: true,
      description: true,
    },
  });
  const lines = [header];
  for (const entry of entries) {
    const cells = [
      sheetDate(entry.occurredOn),
      entry.project?.title ?? "",
      personLabel(entry.user),
      entry.department?.name ?? entry.organization.name,
      entry.taskCategory?.name ?? "",
      entryMethod(entry.mode, entry.startedAt, entry.endedAt),
      sheetTime(entry.startedAt),
      sheetTime(entry.endedAt),
      sheetDuration(entry.durationMinutes),
      entry.durationMinutes === null ? "" : hoursCell(entry.durationMinutes),
      entry.rate?.name ?? "",
      Number(entry.hourlyRate) === 0 ? "" : entry.hourlyRate.toFixed(2),
      entry.inKindValue === null ? "" : entry.inKindValue.toFixed(2),
      entry.tags
        .map((row) => row.tag.name)
        .sort(ordinal)
        .join(", "),
      personLabel(entry.enteredBy),
      sheetDate(entry.createdAt),
      "",
      entry.description ?? "",
      entry.user.profile?.memberNumber ?? "",
    ];
    lines.push(cells.map(csvCell).join(","));
  }

  return csvResponse(lines);
}

export async function summaryCsv(access: Access, organizationId: string, params: URLSearchParams) {
  const data = await report(access, organizationId, params);
  const organization = await access.requireOrganization(organizationId, false);
  const copy = labels(readPreferences(organization.preferences));
  const table = (title: string, rows: { label: string; hours: number; inKind: number }[], hoursHeader: string) => [
    "",
    [title, hoursHeader, "In-Kind Value"].map(csvCell).join(","),
    ...rows.map((row) => [row.label, hoursCell(Math.round(row.hours * 60)), row.inKind.toFixed(2)].map(csvCell).join(",")),
  ];
  const lines = [
    ["Total Volunteer Hours", hoursCell(Math.round(data.user.hours * 60))].map(csvCell).join(","),
    ["Total In-Kind Value", data.user.inKind.toFixed(2)].map(csvCell).join(","),
    ["Unique Volunteers", String(data.user.volunteers)].map(csvCell).join(","),
    ["Total Entries", String(data.user.entries)].map(csvCell).join(","),
    ...table(copy.organization, data.user.byDepartment, "Volunteer Hours"),
    ...table(copy.taskCategory, data.user.byCategory, "Volunteer Hours"),
    ...table("Month", data.user.byMonth, "Volunteer Hours"),
    ...table("Volunteer", data.user.byVolunteer, "Total Hours"),
    ...table(copy.project, data.user.byProject, "Volunteer Hours"),
  ];
  return csvResponse(lines);
}

export async function payroll(access: Access, organizationId: string, params: URLSearchParams) {
  await access.requirePermission(organizationId, "view_payroll");
  const filter = await forCaller(access, organizationId, parseFilter(params));
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true },
  });
  const entries = await prisma.userTimeEntry.findMany({
    where: { ...userWhere(organizationId, filter), rate: { type: "Paid" }, durationMinutes: { not: null } },
    select: {
      userId: true,
      departmentId: true,
      durationMinutes: true,
      hourlyRate: true,
      user: { select: personSelect },
      department: { select: { name: true } },
    },
  });
  const groups = new Map<
    string,
    { userId: string; person: string; group: string; minutes: number; payRate: number; grossCents: number; entries: number }
  >();
  for (const entry of entries) {
    if (entry.durationMinutes === null) continue;
    const payRate = Number(entry.hourlyRate);
    const key = `${entry.userId}:${entry.departmentId ?? ""}:${payRate.toFixed(2)}`;
    const row = groups.get(key) ?? {
      userId: entry.userId,
      person: personLabel(entry.user),
      group: entry.department?.name ?? organization.name,
      minutes: 0,
      payRate,
      grossCents: 0,
      entries: 0,
    };
    row.minutes += entry.durationMinutes;
    row.entries += 1;
    row.grossCents += Math.round(inKindFromMinutes(entry.durationMinutes, payRate) * 100);
    groups.set(key, row);
  }

  const rows = [...groups.values()]
    .map((row) => ({
      id: `${row.userId}:${row.group}:${row.payRate.toFixed(2)}`,
      userId: row.userId,
      person: row.person,
      group: row.group,
      hours: hoursFromMinutes(row.minutes),
      payRate: row.payRate,
      grossPay: row.grossCents / 100,
      entries: row.entries,
    }))
    .sort((a, b) => ordinal(a.person, b.person) || ordinal(a.group, b.group) || b.payRate - a.payRate);
  const minutes = [...groups.values()].reduce((sum, row) => sum + row.minutes, 0);
  return {
    hours: hoursFromMinutes(minutes),
    grossPay: rows.reduce((sum, row) => sum + row.grossPay, 0),
    people: new Set(rows.map((row) => row.userId)).size,
    entries: rows.reduce((sum, row) => sum + row.entries, 0),
    rows,
  };
}

export async function payrollCsv(access: Access, organizationId: string, params: URLSearchParams) {
  const data = await payroll(access, organizationId, params);
  const lines = [
    ["Person", "Group", "Hours", "Pay rate", "Gross pay", "Entries"].map(csvCell).join(","),
    ...data.rows.map((row) =>
      [row.person, row.group, hoursCell(Math.round(row.hours * 60)), row.payRate.toFixed(2), row.grossPay.toFixed(2), String(row.entries)]
        .map(csvCell)
        .join(","),
    ),
  ];
  return csvResponse(lines);
}

export async function viewCsv(access: Access, organizationId: string, params: URLSearchParams) {
  await access.requirePermission(organizationId, "export_reports");
  const data = await report(access, organizationId, params);
  const organization = await access.requireOrganization(organizationId, false);
  const copy = labels(readPreferences(organization.preferences));
  const side = params.get("side") === "collective" ? data.collective : data.user;
  return csvResponse([
    ["Label", "Hours", "In-kind"].map(csvCell).join(","),
    ...side.byProject.map((row) => [row.label, hoursCell(Math.round(row.hours * 60)), row.inKind.toFixed(2)].map(csvCell).join(",")),
    "",
    [`By ${copy.taskCategory}`, "Hours", "In-kind"].map(csvCell).join(","),
    ...side.byCategory.map((row) => [row.label, hoursCell(Math.round(row.hours * 60)), row.inKind.toFixed(2)].map(csvCell).join(",")),
    "",
    [`By ${copy.department}`, "Hours", "In-kind"].map(csvCell).join(","),
    ...side.byDepartment.map((row) => [row.label, hoursCell(Math.round(row.hours * 60)), row.inKind.toFixed(2)].map(csvCell).join(",")),
  ]);
}
