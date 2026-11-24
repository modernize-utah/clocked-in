import assert from "node:assert/strict";
import test from "node:test";
import { viewCsvFromLayout } from "../src/lib/report-view-csv.ts";
import type { ListReportCard, ValueReportCard } from "../src/lib/report-layout.ts";

function valueCard(): ValueReportCard {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "value",
    title: "Volunteer hours",
    description: "",
    accessor: "user.hours",
    column: 1,
    row: 1,
    columns: 3,
    rows: 1,
    color: "primary",
    format: "hours",
    pattern: "0,0.[00]",
    icon: "clock",
  };
}

function listCard(): ListReportCard {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    kind: "list",
    title: "By project",
    description: "",
    accessor: "user.byProject",
    column: 1,
    row: 2,
    columns: 6,
    rows: 5,
    format: "hours",
    pattern: "0,0.[00]",
    visibleColumns: ["name", "hours", "inKind"],
    sortKey: "hours",
    sortDir: "desc",
  };
}

test("download this view follows the card layout and columns", () => {
  const csv = viewCsvFromLayout([valueCard(), listCard()], {
    user: {
      hours: 12.5,
      byProject: [
        { id: "a", label: "Show night", hours: 8, inKind: 280, volunteers: 4 },
        { id: "b", label: "Rehearsal", hours: 4.5, inKind: 160, volunteers: 2 },
      ],
    },
  });
  assert.match(csv, /Volunteer hours/);
  assert.match(csv, /12\.50/);
  assert.match(csv, /By project/);
  assert.match(csv, /Name,Hours,In-kind/);
  assert.ok(csv.indexOf("Show night") < csv.indexOf("Rehearsal"));
  assert.doesNotMatch(csv, /By organization/);
});
