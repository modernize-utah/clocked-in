import assert from "node:assert/strict";
import test from "node:test";
import { clockedInTheme } from "../src/lib/brand.ts";
import { reportFilterSummary } from "../src/lib/report-filter-summary.ts";
import {
  cardsInReadingOrder,
  filtersEqual,
  filtersFromSearch,
  filtersQuery,
  normalizeFilters,
  reportLayoutAutosave,
  type ChartReportCard,
  type ReportCard,
  type ValueReportCard,
} from "../src/lib/report-layout.ts";
import { paginatePdfBlocks, reportPdfBlocks } from "../src/lib/report-pdf/blocks.ts";
import { reportPdfFilename } from "../src/lib/report-pdf/filename.ts";
import { shouldStartNewPage } from "../src/lib/report-pdf/layout.ts";

const names = {
  organization: new Map([["dept-1", "Visual Arts Society"]]),
  project: new Map([["proj-1", "Nutcracker"]]),
  category: new Map([["cat-1", "Rehearsal"]]),
  person: new Map([["user-1", "Jane Smith"]]),
};

const copy = {
  organization: "Group",
  project: "Project",
  taskCategory: "Task category",
  organizations: "Groups",
};

function valueCard(over: Partial<ValueReportCard> & Pick<ValueReportCard, "id" | "title" | "accessor" | "column">): ValueReportCard {
  return {
    kind: "value",
    description: "",
    row: 1,
    columns: 3,
    rows: 1,
    color: "primary",
    format: "hours",
    pattern: "0,0.[00]",
    icon: "clock",
    ...over,
  };
}

function chartCard(): ChartReportCard {
  return {
    id: "chart-1",
    kind: "chart",
    title: "Hours by group",
    description: "",
    accessor: "user.byOrganization",
    column: 1,
    row: 2,
    columns: 12,
    rows: 4,
    chartType: "bar",
    palette: "single",
    valueKey: "hours",
    format: "hours",
    pattern: "0,0.[00]",
  };
}

test("designer layout autosave omits filters", () => {
  const payload = reportLayoutAutosave({ version: 1, cards: [] });
  assert.deepEqual(Object.keys(payload), ["layout"]);
  assert.equal("filters" in payload, false);
});

test("filtersQuery and filtersFromSearch round-trip", () => {
  const filters = { from: "2026-01-01", to: "2026-12-31", organizationId: ["11111111-1111-4111-8111-111111111101"] };
  const query = filtersQuery(filters);
  assert.equal(query.includes("from=2026-01-01"), true);
  assert.equal(query.includes("organizationId=11111111-1111-4111-8111-111111111101"), true);
  assert.deepEqual(filtersFromSearch(new URLSearchParams(query)), filters);
  assert.equal(filtersEqual(filters, filtersFromSearch(new URLSearchParams(query))), true);
  assert.equal(filtersEqual(filters, { ...filters, to: "2026-06-30" }), false);
});

test("multi-id filters join with commas and compare without order", () => {
  const a = "11111111-1111-4111-8111-111111111101";
  const b = "11111111-1111-4111-8111-111111111102";
  const filters = { userId: [a, b] };
  const query = filtersQuery(filters);
  assert.equal(new URLSearchParams(query).get("userId"), `${a},${b}`);
  assert.deepEqual(filtersFromSearch(new URLSearchParams(query)), filters);
  assert.deepEqual(filtersFromSearch(new URLSearchParams(`userId=${a},nope,${a}`)), { userId: [a] });
  assert.equal(filtersEqual({ userId: [a, b] }, { userId: [b, a] }), true);
  assert.equal(filtersEqual({ userId: [a] }, { userId: [a, b] }), false);
});

test("normalizeFilters accepts a legacy string id or a list", () => {
  const a = "11111111-1111-4111-8111-111111111101";
  const b = "11111111-1111-4111-8111-111111111102";
  assert.deepEqual(normalizeFilters({ organizationId: a }), { organizationId: [a] });
  assert.deepEqual(normalizeFilters({ organizationId: [a, b, a] }), { organizationId: [a, b] });
  assert.deepEqual(normalizeFilters({ organizationId: [] }), {});
  assert.throws(() => normalizeFilters({ organizationId: 3 }), /organizationId must be an id or a list of ids/);
  assert.throws(() => normalizeFilters({ organizationId: ["nope"] }), /organizationId must be an id/);
});

test("reportFilterSummary names the active filters", () => {
  assert.equal(reportFilterSummary({}, names, copy), "All time · All groups");
  assert.equal(
    reportFilterSummary({ from: "2026-01-01", to: "2026-12-31", organizationId: ["dept-1"] }, names, copy),
    "Thu, Jan 1, 2026 – Thu, Dec 31, 2026 · Visual Arts Society",
  );
});

test("reportPdfFilename uses the date range or all-time", () => {
  assert.equal(reportPdfFilename("summary", {}), "summary-all-time.pdf");
  assert.equal(reportPdfFilename("summary", { from: "2026-01-01", to: "2026-12-31" }), "summary-2026-01-01-2026-12-31.pdf");
});

test("cardsInReadingOrder is row then column", () => {
  const cards = [
    valueCard({ id: "b", title: "B", accessor: "user.inKind", column: 4, row: 1 }),
    valueCard({ id: "a", title: "A", accessor: "user.hours", column: 1, row: 1 }),
    { ...chartCard(), row: 2 },
  ];
  assert.deepEqual(
    cardsInReadingOrder(cards).map((card) => card.id),
    ["a", "b", "chart-1"],
  );
});

test("reportPdfBlocks groups KPIs then lists charts", () => {
  const cards: ReportCard[] = [
    valueCard({ id: "hours", title: "Hours", accessor: "user.hours", column: 1 }),
    valueCard({ id: "inkind", title: "In-kind", accessor: "user.inKind", column: 4, format: "currency", pattern: "$0,0.00" }),
    chartCard(),
  ];
  const blocks = reportPdfBlocks(cards, { user: { hours: 12, inKind: 425.64, byOrganization: [{ id: "d1", label: "Symphony", hours: 12, inKind: 425.64, volunteers: 2, entries: 1 }] } }, clockedInTheme);
  assert.equal(blocks[0]?.kind, "kpis");
  if (blocks[0]?.kind !== "kpis") return;
  assert.equal(blocks[0].items.length, 2);
  assert.equal(blocks[0].items[0]?.value, "12");
  assert.equal(blocks[1]?.kind, "chart");
});

test("a chart that does not fit the remaining space starts a new page", () => {
  assert.equal(shouldStartNewPage(200, 180), false);
  assert.equal(shouldStartNewPage(120, 240), true);
  const chart = {
    kind: "chart" as const,
    id: "chart-1",
    title: "Hours by group",
    card: chartCard(),
    rows: [],
    colors: ["#001836"],
    legend: [],
    image: null,
    width: 540,
    height: 280,
  };
  const pages = paginatePdfBlocks([chart], 80, 600);
  assert.equal(pages.length, 1);
  const pagesWithPrior = paginatePdfBlocks(
    [{ kind: "kpis", items: [{ title: "Hours", value: "12" }] }, chart],
    80,
    600,
  );
  assert.equal(pagesWithPrior.length, 2);
  assert.equal(pagesWithPrior[1]?.[0]?.kind, "chart");
});

test("a long table splits across pages and repeats the header", () => {
  const table = {
    kind: "table" as const,
    title: "People",
    headers: ["Name", "Hours"],
    rows: Array.from({ length: 20 }, (_, index) => [`Person ${index + 1}`, "1"]),
  };
  const pages = paginatePdfBlocks([table], 80, 160);
  assert.ok(pages.length > 1);
  for (const page of pages) {
    const block = page[0];
    assert.equal(block?.kind, "table");
    if (block?.kind !== "table") return;
    assert.deepEqual(block.headers, ["Name", "Hours"]);
    assert.ok(block.rows.length > 0);
  }
});

test("multiple charts fit on the same page when there is room", () => {
  const makeChart = (id: string, legendCount: number) => ({
    kind: "chart" as const,
    id,
    title: id,
    card: chartCard(),
    rows: [],
    colors: ["#001836"],
    legend: Array.from({ length: legendCount }, (_, i) => ({ label: `Item ${i}`, value: "10", color: "#001836" })),
    image: null,
    width: 540,
    height: 160,
  });
  const blocks = [
    { kind: "kpis" as const, items: [{ title: "Hours", value: "100" }] },
    makeChart("c1", 5),
    makeChart("c2", 4),
    makeChart("c3", 10),
    makeChart("c4", 12),
  ];
  const pages = paginatePdfBlocks(blocks, 580, 660);
  assert.equal(pages.length, 2);
  assert.equal(pages[0]?.filter((b) => b.kind === "chart").length, 2);
  assert.equal(pages[1]?.filter((b) => b.kind === "chart").length, 2);
});
