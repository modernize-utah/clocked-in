import { chartTypes, paletteTypes, type ChartType, type PaletteType } from "@/lib/chart-palette";
import { formatPatterns, patternFor, type FormatPreset } from "@/lib/number-pattern";
import { pathParts } from "@/lib/report-path";

export const reportColumnCount = 12;
export const reportMaxRow = 48;
export const reportMaxCards = 40;

export const valueColors = ["primary", "highlight", "accent", "success"] as const;
export type ValueColor = (typeof valueColors)[number];

export const valueFormats = ["number", "hours", "currency"] as const;
export type ValueFormat = (typeof valueFormats)[number];

export const chartFormats = ["number", "hours", "currency"] as const;
export type ChartFormat = (typeof chartFormats)[number];

export const valueIcons = ["clock", "hand-coins", "users", "list-checks"] as const;
export type ValueIcon = (typeof valueIcons)[number];

export const listColumnKeys = ["name", "type", "hours", "share", "people", "inKind"] as const;
export type ListColumn = (typeof listColumnKeys)[number];

export const listSortKeys = ["name", "hours", "share", "people", "inKind"] as const;
export type ListSortKey = (typeof listSortKeys)[number];

export const listSortDirs = ["asc", "desc"] as const;
export type ListSortDir = (typeof listSortDirs)[number];

export const entriesScopes = ["mine", "tenant"] as const;
export type EntriesScope = (typeof entriesScopes)[number];

export const entriesLimitMax = 20;
export const entriesLimitDefault = 6;
export const listLimitMax = 50;

const listColumnLabels: Record<ListColumn, string> = {
  name: "Name",
  type: "Type",
  hours: "Hours",
  share: "Share",
  people: "People",
  inKind: "In-kind",
};

export function listColumnLabel(column: ListColumn) {
  return listColumnLabels[column];
}

export const chartValueKeys = ["hours", "inKind"] as const;
export type ChartValueKey = (typeof chartValueKeys)[number];

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iconName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ReportBox = { column: number; row: number; columns: number; rows: number };
type Box = ReportBox;

export type ReportCardBase = Box & {
  id: string;
  title: string;
  description: string;
  accessor: string;
};

export type ValueReportCard = ReportCardBase & {
  kind: "value";
  color: ValueColor;
  format: ValueFormat;
  pattern: string;
  icon: string | null;
};

export type ChartReportCard = ReportCardBase & {
  kind: "chart";
  chartType: ChartType;
  palette: PaletteType;
  valueKey: ChartValueKey;
  format: ChartFormat;
  pattern: string;
};

export type ListReportCard = ReportCardBase & {
  kind: "list";
  format: ValueFormat;
  pattern: string;
  visibleColumns: ListColumn[];
  sortKey?: ListSortKey;
  sortDir?: ListSortDir;
  limit?: number;
};

export type EntriesReportCard = ReportCardBase & {
  kind: "entries";
  scope: EntriesScope;
  limit: number;
};

export type ReportCard = ValueReportCard | ChartReportCard | ListReportCard | EntriesReportCard;

export type ReportLayout = {
  version: 1;
  cards: ReportCard[];
};

export type ReportFilters = {
  organizationId?: string[];
  taskCategoryId?: string[];
  projectId?: string[];
  userId?: string[];
  from?: string;
  to?: string;
};

function fail(message: string): never {
  throw new Error(message);
}

function asObject(value: unknown, label: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }

  return { ...(value as Record<string, unknown>) };
}

function take(source: Record<string, unknown>, key: string) {
  const has = Object.prototype.hasOwnProperty.call(source, key);
  const value = source[key];
  delete source[key];
  return { has, value };
}

function leftover(source: Record<string, unknown>, label: string) {
  if (Object.keys(source).length > 0) {
    fail(`${label} contains an unknown field.`);
  }
}

function optionalOneOf<T extends string>(field: { has: boolean; value: unknown }, key: string, allowed: readonly T[]) {
  if (!field.has || field.value === undefined || field.value === null) {
    return undefined;
  }

  return oneOf(field.value, key, allowed);
}

function optionalInteger(field: { has: boolean; value: unknown }, key: string, min: number, max: number) {
  if (!field.has || field.value === undefined || field.value === null) {
    return undefined;
  }

  const value = integer(field.value, key);
  if (value < min || value > max) {
    fail(`${key} must be from ${min} to ${max}.`);
  }

  return value;
}

function text(value: unknown, key: string, max: number, required: boolean) {
  if (typeof value !== "string") {
    fail(required ? `${key} is required.` : `${key} must be a string.`);
  }

  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    fail(`${key} is required.`);
  }

  if (trimmed.length > max) {
    fail(`${key} must be ${max} characters or less.`);
  }

  return trimmed;
}

function integer(value: unknown, key: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    fail(`${key} must be an integer.`);
  }

  return value;
}

function oneOf<T extends string>(value: unknown, key: string, allowed: readonly T[]) {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(`${key} must be ${allowed.join(", ")}.`);
  }

  return value as T;
}

function id(value: unknown, key: string) {
  if (typeof value !== "string" || !uuid.test(value)) {
    fail(`${key} must be an id.`);
  }

  return value.toLowerCase();
}

function dateText(value: unknown, key: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`${key} must be a date.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail(`${key} must be a date.`);
  }

  return value;
}

export function overlaps(left: Box, right: Box) {
  return (
    left.column < right.column + right.columns &&
    left.column + left.columns > right.column &&
    left.row < right.row + right.rows &&
    left.row + left.rows > right.row
  );
}

function card(value: unknown, index: number): ReportCard {
  const source = asObject(value, `cards[${index}]`);
  const kind = oneOf(take(source, "kind").value, "kind", ["value", "chart", "list", "entries"] as const);
  const cardId = id(take(source, "id").value, "id");
  const title = text(take(source, "title").value, "title", 120, true);
  const descriptionField = take(source, "description");
  const description = descriptionField.has ? text(descriptionField.value, "description", 300, false) : "";
  const column = integer(take(source, "column").value, "column");
  const row = integer(take(source, "row").value, "row");
  const columns = integer(take(source, "columns").value, "columns");
  const rows = integer(take(source, "rows").value, "rows");
  const accessor = text(take(source, "accessor").value, "accessor", 200, true);
  if (column < 1 || column > reportColumnCount) {
    fail("column must be from 1 to 12.");
  }

  if (columns < 1 || column + columns - 1 > reportColumnCount) {
    fail("columns must leave the card inside column 12.");
  }

  if (row < 1 || row > reportMaxRow) {
    fail("row must be from 1 to 48.");
  }

  if (rows < 1 || row + rows - 1 > reportMaxRow) {
    fail("rows must leave the card inside row 48.");
  }

  if (!pathParts(accessor)) {
    fail("accessor must be a path such as user.hours.");
  }

  const base = { id: cardId, title, description, column, row, columns, rows, accessor };
  if (kind === "value") {
    const color = oneOf(take(source, "color").value, "color", valueColors);
    const format = oneOf(take(source, "format").value, "format", valueFormats);
    const pattern = readPattern(take(source, "pattern"), format);
    const icon = readIcon(take(source, "icon"));
    leftover(source, "cards");
    return { ...base, kind, color, format, pattern, icon };
  }

  if (kind === "list") {
    const format = oneOf(take(source, "format").value, "format", valueFormats);
    const pattern = readPattern(take(source, "pattern"), format);
    const visibleColumns = readVisibleColumns(take(source, "visibleColumns").value);
    const sortKey = optionalOneOf(take(source, "sortKey"), "sortKey", listSortKeys);
    const sortDir = optionalOneOf(take(source, "sortDir"), "sortDir", listSortDirs);
    const limit = optionalInteger(take(source, "limit"), "limit", 1, listLimitMax);
    leftover(source, "cards");
    return {
      ...base,
      kind,
      format,
      pattern,
      visibleColumns,
      ...(sortKey ? { sortKey } : {}),
      ...(sortDir ? { sortDir } : {}),
      ...(limit !== undefined ? { limit } : {}),
    };
  }

  if (kind === "entries") {
    const scopeField = take(source, "scope");
    const scope = scopeField.has && scopeField.value !== undefined
      ? oneOf(scopeField.value, "scope", entriesScopes)
      : "mine";
    const limit = optionalInteger(take(source, "limit"), "limit", 1, entriesLimitMax) ?? entriesLimitDefault;
    leftover(source, "cards");
    return { ...base, kind, scope, limit, accessor: `entries.${scope}` };
  }

  const chartType = oneOf(take(source, "chartType").value, "chartType", chartTypes);
  const palette = oneOf(take(source, "palette").value, "palette", paletteTypes);
  const valueKey = oneOf(take(source, "valueKey").value, "valueKey", chartValueKeys);
  const format = oneOf(take(source, "format").value, "format", chartFormats);
  const pattern = readPattern(take(source, "pattern"), format);
  leftover(source, "cards");
  return { ...base, kind, chartType, palette, valueKey, format, pattern };
}

function readPattern(field: { has: boolean; value: unknown }, format: FormatPreset) {
  if (!field.has || field.value === undefined) return formatPatterns[format];
  const pattern = text(field.value, "pattern", 40, true);
  return pattern || patternFor(format);
}

function readIcon(field: { has: boolean; value: unknown }) {
  if (!field.has || field.value === null) return null;
  const icon = text(field.value, "icon", 64, true);
  if (!iconName.test(icon)) fail("icon must be a Lucide icon name.");
  return icon;
}

function readVisibleColumns(value: unknown) {
  if (!Array.isArray(value)) fail("visibleColumns must be an array.");
  const seen = new Set<string>();
  const columns: ListColumn[] = [];
  for (const item of value) {
    const column = oneOf(item, "visibleColumns", listColumnKeys);
    if (seen.has(column)) fail("visibleColumns must be unique.");
    seen.add(column);
    columns.push(column);
  }
  return listColumnKeys.filter((column) => columns.includes(column));
}

export function normalizeLayout(value: unknown): ReportLayout {
  const source = asObject(value, "layout");
  const version = take(source, "version").value;
  if (version !== 1) {
    fail("version must be 1.");
  }

  const cardsField = take(source, "cards").value;
  leftover(source, "layout");
  if (!Array.isArray(cardsField)) {
    fail("cards must be an array.");
  }

  if (cardsField.length > reportMaxCards) {
    fail("A report can have at most 40 cards.");
  }

  const cards = cardsField.map((item, index) => card(item, index));
  const ids = new Set<string>();
  for (const item of cards) {
    if (ids.has(item.id)) {
      fail("cards must have unique ids.");
    }

    ids.add(item.id);
    if (cards.some((other) => other.id !== item.id && overlaps(item, other))) {
      fail("Cards cannot overlap.");
    }
  }

  return { version: 1, cards };
}

export const reportIdFilterKeys = ["organizationId", "taskCategoryId", "projectId", "userId"] as const;
export type ReportIdFilterKey = (typeof reportIdFilterKeys)[number];
export const reportFilterKeys = [...reportIdFilterKeys, "from", "to"] as const;

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

function isIdKey(key: (typeof reportFilterKeys)[number]): key is ReportIdFilterKey {
  return key !== "from" && key !== "to";
}

/** URL/query form of a filter value: ids joined with commas, dates as-is. */
export function filterParam(filters: ReportFilters, key: (typeof reportFilterKeys)[number]) {
  if (isIdKey(key)) {
    const ids = filters[key];
    return ids && ids.length > 0 ? ids.join(",") : undefined;
  }
  return filters[key] || undefined;
}

export function filterParams(filters: ReportFilters) {
  const params: Record<string, string | undefined> = {};
  for (const key of reportFilterKeys) params[key] = filterParam(filters, key);
  return params;
}

export function filtersQuery(filters: ReportFilters) {
  const params = new URLSearchParams();
  for (const key of reportFilterKeys) {
    const value = filterParam(filters, key);
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function filtersEqual(left: ReportFilters, right: ReportFilters) {
  return reportFilterKeys.every((key) => {
    if (!isIdKey(key)) return (left[key] ?? "") === (right[key] ?? "");
    const a = [...(left[key] ?? [])].sort().join(",");
    const b = [...(right[key] ?? [])].sort().join(",");
    return a === b;
  });
}

export function activeIdFilterCount(filters: ReportFilters) {
  return reportIdFilterKeys.filter((key) => (filters[key]?.length ?? 0) > 0).length;
}

/** Layout-only PATCH body so designer autosave does not wipe stored filters. */
export function reportLayoutAutosave(layout: ReportLayout) {
  return { layout };
}

export function filtersFromSearch(search: { get: (key: string) => string | null }): ReportFilters {
  const filters: ReportFilters = {};
  for (const key of reportFilterKeys) {
    const value = search.get(key);
    if (!value) continue;
    if (!isIdKey(key)) {
      if (dateOnly.test(value)) filters[key] = value;
      continue;
    }
    const ids = [...new Set(value.split(",").map((part) => part.trim().toLowerCase()).filter((part) => uuid.test(part)))];
    if (ids.length > 0) filters[key] = ids;
  }
  return filters;
}

function idList(value: unknown, key: string) {
  const parts = typeof value === "string" ? value.split(",").map((part) => part.trim()).filter(Boolean) : value;
  if (!Array.isArray(parts)) {
    fail(`${key} must be an id or a list of ids.`);
  }
  return [...new Set(parts.map((part) => id(part, key)))];
}

export function cardsInReadingOrder<T extends Box>(cards: T[]) {
  return [...cards].sort((left, right) => left.row - right.row || left.column - right.column);
}

export function normalizeFilters(value: unknown): ReportFilters {
  if (value === undefined) {
    return {};
  }

  const source = asObject(value, "filters");
  const filters: ReportFilters = {};
  for (const key of reportFilterKeys) {
    const field = take(source, key);
    if (!field.has || field.value === null) {
      continue;
    }

    if (isIdKey(key)) {
      const ids = idList(field.value, key);
      if (ids.length > 0) filters[key] = ids;
    } else {
      filters[key] = dateText(field.value, key);
    }
  }

  leftover(source, "filters");
  if (filters.from && filters.to && filters.from > filters.to) {
    fail("from must be on or before to.");
  }

  return filters;
}

export function normalizeReportName(value: unknown) {
  return text(value, "name", 80, true);
}

export function layoutError(value: unknown) {
  try {
    normalizeLayout(value);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "layout is invalid.";
  }
}

export function emptyLayout(): ReportLayout {
  return { version: 1, cards: [] };
}

export const reportTemplateIds = ["summary", "people", "groups", "staff"] as const;
export type ReportTemplateId = (typeof reportTemplateIds)[number];

export const builtinTemplateIds: Record<ReportTemplateId, string> = {
  summary: "11111111-1111-4111-8111-111111111101",
  people: "11111111-1111-4111-8111-111111111102",
  groups: "11111111-1111-4111-8111-111111111103",
  staff: "11111111-1111-4111-8111-111111111104",
};

const templateLabels: Record<ReportTemplateId, string> = {
  summary: "Summary",
  people: "People",
  groups: "Group sessions",
  staff: "Staff",
};

export function reportTemplateLabel(id: ReportTemplateId) {
  return templateLabels[id];
}

function templateId(slot: number) {
  return `00000000-0000-4000-8000-${slot.toString(16).padStart(12, "0")}`;
}

type TemplateCopy = { organization: string; taskCategory: string; project: string };

function valueCard(
  slot: number,
  column: number,
  input: Omit<ValueReportCard, "id" | "kind" | "column" | "row" | "columns" | "rows" | "description" | "pattern"> & {
    columns?: number;
  },
): ValueReportCard {
  return {
    id: templateId(slot),
    kind: "value",
    column,
    row: 1,
    columns: input.columns ?? 3,
    rows: 1,
    description: "",
    pattern: formatPatterns[input.format],
    ...input,
  };
}

function chartCard(
  slot: number,
  index: number,
  input: Omit<ChartReportCard, "id" | "kind" | "column" | "row" | "columns" | "rows" | "description" | "pattern" | "palette">,
): ChartReportCard {
  return {
    id: templateId(slot),
    kind: "chart",
    description: "",
    palette: "single",
    pattern: formatPatterns[input.format],
    column: index % 2 === 0 ? 1 : 7,
    row: 2 + Math.floor(index / 2) * 4,
    columns: 6,
    rows: 4,
    ...input,
  };
}

function listCard(
  slot: number,
  place: { column: number; row: number },
  input: Omit<ListReportCard, "id" | "kind" | "column" | "row" | "columns" | "rows" | "description" | "pattern" | "format">,
): ListReportCard {
  return {
    id: templateId(slot),
    kind: "list",
    description: "",
    format: "hours",
    pattern: formatPatterns.hours,
    column: place.column,
    row: place.row,
    columns: 6,
    rows: 5,
    ...input,
  };
}

export function reportTemplate(id: ReportTemplateId, copy: TemplateCopy): ReportLayout {
  if (id === "people") return peopleTemplate(copy);
  if (id === "groups") return groupsTemplate(copy);
  if (id === "staff") return staffTemplate(copy);
  return summaryTemplate(copy);
}

function summaryTemplate(copy: TemplateCopy): ReportLayout {
  const charts = [
    chartCard(5, 0, { title: `Hours by ${copy.organization.toLowerCase()}`, accessor: "user.byOrganization", chartType: "column", valueKey: "hours", format: "hours" }),
    chartCard(6, 1, { title: `Hours by ${copy.taskCategory.toLowerCase()}`, accessor: "user.byCategory", chartType: "column", valueKey: "hours", format: "hours" }),
    chartCard(7, 2, { title: "In-kind by month", accessor: "user.byMonth", chartType: "column", valueKey: "inKind", format: "currency" }),
    chartCard(8, 3, { title: "Hours by volunteer", accessor: "user.byVolunteer", chartType: "bar", valueKey: "hours", format: "hours" }),
    chartCard(9, 4, { title: "Hours by month", accessor: "user.byMonth", chartType: "column", valueKey: "hours", format: "hours" }),
    chartCard(10, 5, { title: `Hours by ${copy.project.toLowerCase()}`, accessor: "user.byProject", chartType: "bar", valueKey: "hours", format: "hours" }),
  ];
  return { version: 1, cards: [...volunteerTotals(1), ...charts] };
}

function peopleTemplate(copy: TemplateCopy): ReportLayout {
  const measure: ListColumn[] = ["name", "hours", "share", "inKind"];
  return {
    version: 1,
    cards: [
      ...volunteerTotals(20),
      listCard(24, { column: 1, row: 2 }, { title: `By ${copy.project.toLowerCase()}`, accessor: "user.byProject", visibleColumns: ["name", "type", "hours", "share", "people", "inKind"] }),
      listCard(25, { column: 7, row: 2 }, { title: "By person", accessor: "user.byPerson", visibleColumns: measure }),
      listCard(26, { column: 1, row: 7 }, { title: `By ${copy.organization.toLowerCase()}`, accessor: "user.byOrganization", visibleColumns: ["name", "hours", "share", "people", "inKind"] }),
      listCard(27, { column: 7, row: 7 }, { title: `By ${copy.taskCategory.toLowerCase()}`, accessor: "user.byCategory", visibleColumns: ["name", "hours", "share", "people", "inKind"] }),
    ],
  };
}

function groupsTemplate(copy: TemplateCopy): ReportLayout {
  const measure: ListColumn[] = ["name", "hours", "share", "inKind"];
  return {
    version: 1,
    cards: [
      valueCard(30, 1, { title: "Hours", accessor: "collective.hours", color: "primary", format: "hours", icon: "clock", columns: 4 }),
      valueCard(31, 5, { title: "In-kind value", accessor: "collective.inKind", color: "success", format: "currency", icon: "hand-coins", columns: 4 }),
      valueCard(32, 9, { title: "Sessions", accessor: "collective.entries", color: "accent", format: "number", icon: "list-checks", columns: 4 }),
      listCard(33, { column: 1, row: 2 }, { title: `By ${copy.project.toLowerCase()}`, accessor: "collective.byProject", visibleColumns: ["name", "type", "hours", "share", "inKind"] }),
      listCard(34, { column: 7, row: 2 }, { title: `By ${copy.organization.toLowerCase()}`, accessor: "collective.byOrganization", visibleColumns: measure }),
      listCard(35, { column: 1, row: 7 }, { title: `By ${copy.taskCategory.toLowerCase()}`, accessor: "collective.byCategory", visibleColumns: measure }),
    ],
  };
}

function staffTemplate(copy: TemplateCopy): ReportLayout {
  const measure: ListColumn[] = ["name", "hours", "share", "inKind"];
  return {
    version: 1,
    cards: [
      valueCard(40, 1, { title: "Staff hours", accessor: "staff.hours", color: "primary", format: "hours", icon: "clock" }),
      valueCard(41, 4, { title: "In-kind value", accessor: "staff.inKind", color: "success", format: "currency", icon: "hand-coins" }),
      valueCard(42, 7, { title: "Staff", accessor: "staff.volunteers", color: "highlight", format: "number", icon: "users" }),
      valueCard(43, 10, { title: "Entries", accessor: "staff.entries", color: "accent", format: "number", icon: "list-checks" }),
      listCard(44, { column: 1, row: 2 }, { title: `By ${copy.organization.toLowerCase()}`, accessor: "staff.byOrganization", visibleColumns: measure }),
      listCard(45, { column: 7, row: 2 }, { title: `By ${copy.project.toLowerCase()}`, accessor: "staff.byProject", visibleColumns: ["name", "type", "hours", "share", "inKind"] }),
      listCard(46, { column: 1, row: 7 }, { title: "By person", accessor: "staff.byPerson", visibleColumns: measure }),
    ],
  };
}

function volunteerTotals(slot: number): ValueReportCard[] {
  return [
    valueCard(slot, 1, { title: "Total volunteer hours", accessor: "user.hours", color: "primary", format: "hours", icon: "clock" }),
    valueCard(slot + 1, 4, { title: "In-kind value", accessor: "user.inKind", color: "success", format: "currency", icon: "hand-coins" }),
    valueCard(slot + 2, 7, { title: "Volunteers", accessor: "user.volunteers", color: "highlight", format: "number", icon: "users" }),
    valueCard(slot + 3, 10, { title: "Entries", accessor: "user.entries", color: "accent", format: "number", icon: "list-checks" }),
  ];
}

export type ListRow = {
  id: string;
  label: string;
  hours: number;
  inKind: number;
  volunteers: number;
  entries?: number;
  projectType?: string;
};

function listSortValue(row: ListRow, key: ListSortKey, totalHours: number): string | number {
  if (key === "name") return row.label;
  if (key === "hours") return row.hours;
  if (key === "inKind") return row.inKind;
  if (key === "people") return row.volunteers;
  return totalHours === 0 ? 0 : row.hours / totalHours;
}

export function presentListRows<T extends ListRow>(
  rows: T[],
  card: Pick<ListReportCard, "sortKey" | "sortDir" | "limit">,
): T[] {
  const sortKey = card.sortKey ?? (card.limit !== undefined ? "hours" : undefined);
  const sortDir = card.sortDir ?? "desc";
  const copy = [...rows];
  if (sortKey) {
    const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
    copy.sort((left, right) => {
      const a = listSortValue(left, sortKey, totalHours);
      const b = listSortValue(right, sortKey, totalHours);
      const cmp = typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : Number(a) - Number(b);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  if (card.limit === undefined || copy.length <= card.limit) {
    return copy;
  }

  const head = copy.slice(0, card.limit);
  const rest = copy.slice(card.limit);
  const other = {
    ...(copy[0] ?? ({ id: "other", label: "Other", hours: 0, inKind: 0, volunteers: 0 } as T)),
    id: "other",
    label: "Other",
    hours: rest.reduce((sum, row) => sum + row.hours, 0),
    inKind: rest.reduce((sum, row) => sum + row.inKind, 0),
    volunteers: rest.reduce((sum, row) => sum + row.volunteers, 0),
    ...(rest[0] && "entries" in rest[0]
      ? { entries: rest.reduce((sum, row) => sum + (row.entries ?? 0), 0) }
      : {}),
    projectType: undefined,
  } as T;
  return [...head, other];
}

function entriesCard(
  slot: number,
  place: { column: number; row: number; columns: number; rows: number },
  input: { title: string; scope?: EntriesScope; limit?: number },
): EntriesReportCard {
  const scope = input.scope ?? "mine";
  return {
    id: templateId(slot),
    kind: "entries",
    title: input.title,
    description: "",
    accessor: `entries.${scope}`,
    scope,
    limit: input.limit ?? entriesLimitDefault,
    ...place,
  };
}

export function dashboardLayout(): ReportLayout {
  return {
    version: 1,
    cards: [
      valueCard(50, 1, { title: "Volunteer hours", accessor: "user.hours", color: "primary", format: "hours", icon: "clock" }),
      valueCard(51, 4, { title: "In-kind value", accessor: "user.inKind", color: "success", format: "currency", icon: "hand-coins" }),
      valueCard(52, 7, { title: "Volunteers", accessor: "user.volunteers", color: "highlight", format: "number", icon: "users" }),
      valueCard(53, 10, { title: "Entries", accessor: "user.entries", color: "accent", format: "number", icon: "list-checks" }),
      {
        id: templateId(54),
        kind: "chart",
        title: "Hours by task category",
        description: "",
        accessor: "user.byCategory",
        chartType: "donut",
        palette: "single",
        valueKey: "hours",
        format: "hours",
        pattern: formatPatterns.hours,
        column: 1,
        row: 2,
        columns: 6,
        rows: 4,
      },
      {
        id: templateId(55),
        kind: "chart",
        title: "Hours by organization",
        description: "",
        accessor: "user.byOrganization",
        chartType: "bar",
        palette: "single",
        valueKey: "hours",
        format: "hours",
        pattern: formatPatterns.hours,
        column: 7,
        row: 2,
        columns: 6,
        rows: 4,
      },
      entriesCard(56, { column: 1, row: 6, columns: 12, rows: 5 }, { title: "Recent entries" }),
    ],
  };
}

export function collides(cards: ReportCard[], candidate: Box, ignoreId: string) {
  return cards.some((card) => card.id !== ignoreId && overlaps(card, candidate));
}

export function firstOpening(cards: ReportCard[], columns: number, rows: number, startRow = 1) {
  for (let row = Math.max(1, startRow); row <= reportMaxRow - rows + 1; row += 1) {
    for (let column = 1; column <= reportColumnCount - columns + 1; column += 1) {
      const candidate = { column, row, columns, rows };
      if (!cards.some((card) => overlaps(card, candidate))) {
        return candidate;
      }
    }
  }

  return null;
}
