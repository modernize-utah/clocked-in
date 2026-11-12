import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ClockIcon, HandCoinsIcon, ListChecksIcon, UsersIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Rect } from "react-native-svg";
import { api } from "@/api/client";
import type { Report, ReportBucket, ReportCard } from "@/api/types";
import { EntryDays } from "@/entries";
import { formatCurrency, formatHours, formatNumber } from "@/format";
import { getPath } from "@/report-path";
import { useColors } from "@/theme";
import { Muted, Panel, PanelHeader } from "@/ui";
import { useWorkspace } from "@/workspace";

const icons = { clock: ClockIcon, "hand-coins": HandCoinsIcon, users: UsersIcon, "list-checks": ListChecksIcon };

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asRows(value: unknown): ReportBucket[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<ReportBucket>;
    if (typeof row.label !== "string") return [];
    return [
      {
        id: typeof row.id === "string" ? row.id : row.label,
        label: row.label,
        hours: asNumber(row.hours),
        volunteers: asNumber(row.volunteers),
        entries: asNumber(row.entries),
        inKind: asNumber(row.inKind),
      },
    ];
  });
}

function formatValue(value: number, format: string | undefined) {
  if (format === "currency") return formatCurrency(value);
  if (format === "hours") return formatHours(value);
  return formatNumber(value);
}

function filterFor(accessor: string, id: string) {
  if (accessor.endsWith("byProject")) return { projectId: id };
  if (accessor.endsWith("byCategory")) return { taskCategoryId: id };
  if (accessor.endsWith("byDepartment")) return { departmentId: id };
  if (accessor.endsWith("byPerson") || accessor.endsWith("byVolunteer")) return { person: id };
  return null;
}

export function defaultDashboardCards(): ReportCard[] {
  return [
    { id: "hours", kind: "value", title: "Volunteer hours", description: "", accessor: "user.hours", format: "hours", color: "primary", icon: "clock" },
    { id: "value", kind: "value", title: "In-kind value", description: "", accessor: "user.inKind", format: "currency", color: "success", icon: "hand-coins" },
    { id: "people", kind: "value", title: "Volunteers", description: "", accessor: "user.volunteers", format: "number", color: "highlight", icon: "users" },
    { id: "entries", kind: "value", title: "Entries", description: "", accessor: "user.entries", format: "number", color: "accent", icon: "list-checks" },
    { id: "category", kind: "chart", title: "Hours by task category", description: "", accessor: "user.byCategory", chartType: "donut", valueKey: "hours", format: "hours" },
    { id: "group", kind: "chart", title: "Hours by group", description: "", accessor: "user.byDepartment", chartType: "bar", valueKey: "hours", format: "hours" },
    { id: "recent", kind: "entries", title: "Recent entries", description: "", accessor: "", scope: "mine", limit: 6 },
  ];
}

export function standardCards(id: string, labels: { project: string; department: string; taskCategory: string }): ReportCard[] {
  const project = labels.project.toLowerCase();
  const department = labels.department.toLowerCase();
  const category = labels.taskCategory.toLowerCase();
  if (id === "people") {
    return [
      ...defaultDashboardCards().filter((card) => card.kind === "value"),
      { id: "p1", kind: "list", title: `By ${project}`, description: "", accessor: "user.byProject", visibleColumns: ["name", "hours", "inKind"] },
      { id: "p2", kind: "list", title: "By person", description: "", accessor: "user.byPerson", visibleColumns: ["name", "hours", "inKind"] },
      { id: "p3", kind: "list", title: `By ${department}`, description: "", accessor: "user.byDepartment", visibleColumns: ["name", "hours", "inKind"] },
      { id: "p4", kind: "list", title: `By ${category}`, description: "", accessor: "user.byCategory", visibleColumns: ["name", "hours", "inKind"] },
    ];
  }
  if (id === "groups") {
    return [
      { id: "g1", kind: "value", title: "Hours", description: "", accessor: "collective.hours", format: "hours", color: "primary", icon: "clock" },
      { id: "g2", kind: "value", title: "In-kind value", description: "", accessor: "collective.inKind", format: "currency", color: "success", icon: "hand-coins" },
      { id: "g3", kind: "value", title: "Sessions", description: "", accessor: "collective.entries", format: "number", color: "accent", icon: "list-checks" },
      { id: "g4", kind: "list", title: `By ${project}`, description: "", accessor: "collective.byProject", visibleColumns: ["name", "hours", "inKind"] },
      { id: "g5", kind: "list", title: `By ${department}`, description: "", accessor: "collective.byDepartment", visibleColumns: ["name", "hours", "inKind"] },
    ];
  }
  if (id === "staff") {
    return [
      { id: "s1", kind: "value", title: "Staff hours", description: "", accessor: "staff.hours", format: "hours", color: "primary", icon: "clock" },
      { id: "s2", kind: "value", title: "In-kind value", description: "", accessor: "staff.inKind", format: "currency", color: "success", icon: "hand-coins" },
      { id: "s3", kind: "value", title: "Staff", description: "", accessor: "staff.volunteers", format: "number", color: "highlight", icon: "users" },
      { id: "s4", kind: "value", title: "Entries", description: "", accessor: "staff.entries", format: "number", color: "accent", icon: "list-checks" },
      { id: "s5", kind: "list", title: `By ${department}`, description: "", accessor: "staff.byDepartment", visibleColumns: ["name", "hours", "inKind"] },
      { id: "s6", kind: "list", title: `By ${project}`, description: "", accessor: "staff.byProject", visibleColumns: ["name", "hours", "inKind"] },
      { id: "s7", kind: "list", title: "By person", description: "", accessor: "staff.byPerson", visibleColumns: ["name", "hours", "inKind"] },
    ];
  }
  return [
    ...defaultDashboardCards().filter((card) => card.kind === "value"),
    { id: "c1", kind: "chart", title: `Hours by ${department}`, description: "", accessor: "user.byDepartment", chartType: "column", valueKey: "hours", format: "hours" },
    { id: "c2", kind: "chart", title: `Hours by ${category}`, description: "", accessor: "user.byCategory", chartType: "donut", valueKey: "hours", format: "hours" },
    { id: "c3", kind: "chart", title: `Hours by ${project}`, description: "", accessor: "user.byProject", chartType: "bar", valueKey: "hours", format: "hours" },
  ];
}

export function ReportGrid({ cards, data }: { cards: ReportCard[]; data: Report | undefined }) {
  const values = cards.filter((card) => card.kind === "value");
  const rest = cards.filter((card) => card.kind !== "value");
  return (
    <View style={{ gap: 16 }}>
      {values.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {values.map((card) => (
            <ValueCard card={card} data={data} key={card.id} />
          ))}
        </View>
      ) : null}
      {rest.map((card) =>
        card.kind === "chart" ? (
          <ChartCard card={card} data={data} key={card.id} />
        ) : card.kind === "list" ? (
          <ListCard card={card} data={data} key={card.id} />
        ) : (
          <EntriesCard card={card} key={card.id} />
        ),
      )}
    </View>
  );
}

function ValueCard({ card, data }: { card: ReportCard; data: Report | undefined }) {
  const colors = useColors();
  const Icon = card.icon && card.icon in icons ? icons[card.icon as keyof typeof icons] : null;
  const color =
    card.color === "success" ? colors.success : card.color === "highlight" ? colors.highlight : card.color === "accent" ? colors.brandAccent : colors.primary;
  return (
    <Pressable
      onPress={() => router.push("/entries")}
      style={{ flexBasis: "47%", flexGrow: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.card, padding: 14, gap: 8 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{card.title}</Text>
        {Icon ? <Icon color={color} size={16} /> : null}
      </View>
      <Text style={{ color: colors.cardForeground, fontSize: 22, fontWeight: "600" }}>{formatValue(asNumber(getPath(data, card.accessor)), card.format)}</Text>
      {card.description ? <Muted>{card.description}</Muted> : null}
    </Pressable>
  );
}

function ChartCard({ card, data }: { card: ReportCard; data: Report | undefined }) {
  const colors = useColors();
  const rows = asRows(getPath(data, card.accessor)).slice(0, 8);
  const key = card.valueKey === "inKind" ? "inKind" : "hours";
  const palette = [colors.primary, colors.highlight, colors.brandAccent, colors.success, colors.mutedForeground];
  const open = (id: string) => {
    const filter = filterFor(card.accessor, id);
    if (filter) router.push({ pathname: "/entries", params: filter });
  };
  return (
    <Panel>
      <PanelHeader description={card.description || undefined} title={card.title} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
        {rows.length === 0 ? <Muted>No hours yet.</Muted> : null}
        {card.chartType === "donut" || card.chartType === "pie" ? (
          <Donut colors={palette} onPress={open} rows={rows.map((row) => ({ id: row.id, label: row.label, value: row[key] }))} />
        ) : (
          <Bars
            color={colors.primary}
            horizontal={card.chartType !== "column"}
            onPress={open}
            rows={rows.map((row) => ({ id: row.id, label: row.label, value: row[key] }))}
          />
        )}
      </View>
    </Panel>
  );
}

function Bars({
  rows,
  horizontal,
  color,
  onPress,
}: {
  rows: { id: string; label: string; value: number }[];
  horizontal: boolean;
  color: string;
  onPress: (id: string) => void;
}) {
  const colors = useColors();
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (horizontal) {
    return (
      <View style={{ gap: 10 }}>
        {rows.map((row) => (
          <Pressable key={row.id} onPress={() => onPress(row.id)} style={{ gap: 4 }}>
            <Text numberOfLines={1} style={{ color: colors.cardForeground, fontSize: 13 }}>
              {row.label} · {formatNumber(row.value)}
            </Text>
            <Svg height={10} width="100%">
              <Rect fill={colors.muted} height={10} rx={4} width="100%" />
              <Rect fill={color} height={10} rx={4} width={`${(row.value / max) * 100}%`} />
            </Svg>
          </Pressable>
        ))}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 140 }}>
      {rows.map((row) => (
        <Pressable key={row.id} onPress={() => onPress(row.id)} style={{ flex: 1, alignItems: "center", gap: 4 }}>
          <Svg height={100} width="100%">
            <Rect fill={color} height={(row.value / max) * 100} width="100%" y={100 - (row.value / max) * 100} />
          </Svg>
          <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 10 }}>
            {row.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Donut({ rows, colors: palette, onPress }: { rows: { id: string; label: string; value: number }[]; colors: string[]; onPress: (id: string) => void }) {
  const colors = useColors();
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
  const circumference = 2 * Math.PI * 36;
  let offset = 0;
  return (
    <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
      <Svg height={120} width={120}>
        {rows.map((row, index) => {
          const length = (row.value / total) * circumference;
          const element = (
            <Circle
              cx={60}
              cy={60}
              fill="none"
              key={row.id}
              origin="60, 60"
              r={36}
              rotation={-90}
              stroke={palette[index % palette.length]}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              strokeWidth={16}
            />
          );
          offset += length;
          return element;
        })}
      </Svg>
      <View style={{ flex: 1, gap: 6 }}>
        {rows.map((row, index) => (
          <Pressable key={row.id} onPress={() => onPress(row.id)} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette[index % palette.length] }} />
            <Text numberOfLines={1} style={{ flex: 1, color: colors.cardForeground, fontSize: 13 }}>
              {row.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ListCard({ card, data }: { card: ReportCard; data: Report | undefined }) {
  const colors = useColors();
  const rows = asRows(getPath(data, card.accessor)).slice(0, card.limit ?? 12);
  const columns = card.visibleColumns ?? ["name", "hours"];
  return (
    <Panel>
      <PanelHeader description={card.description || undefined} title={card.title} />
      {rows.length === 0 ? (
        <View style={{ padding: 16 }}>
          <Muted>Nothing to show.</Muted>
        </View>
      ) : (
        rows.map((row) => (
          <Pressable
            key={row.id}
            onPress={() => {
              const filter = filterFor(card.accessor, row.id);
              if (filter) router.push({ pathname: "/entries", params: filter });
            }}
            style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.border }}
          >
            <Text numberOfLines={1} style={{ flex: 1, color: colors.cardForeground, fontSize: 14 }}>
              {columns.includes("name") ? row.label : ""}
            </Text>
            {columns.includes("hours") ? <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{formatHours(row.hours)}</Text> : null}
            {columns.includes("inKind") ? <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{formatCurrency(row.inKind)}</Text> : null}
            {columns.includes("people") ? <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{formatNumber(row.volunteers)}</Text> : null}
          </Pressable>
        ))
      )}
    </Panel>
  );
}

function EntriesCard({ card }: { card: ReportCard }) {
  const { organization, viewer } = useWorkspace();
  const mine = card.scope !== "organization";
  const entries = useQuery({
    queryKey: ["report-entries", organization.id, mine ? viewer.id : "org", card.limit ?? 6],
    queryFn: () =>
      mine
        ? api.entries(viewer.id, { organizationId: organization.id, limit: card.limit ?? 6 })
        : api.orgEntries(organization.id, { limit: card.limit ?? 6 }),
  });
  return (
    <Panel>
      <PanelHeader description={card.description || undefined} title={card.title || "Entries"} />
      <EntryDays entries={entries.data?.items ?? []} />
      {!entries.data?.items.length ? (
        <View style={{ padding: 16 }}>
          <Muted>{entries.isPending ? "Loading…" : "No entries."}</Muted>
        </View>
      ) : null}
    </Panel>
  );
}
