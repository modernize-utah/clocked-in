import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { BarChart3Icon } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api } from "@/api/client";
import type { ReportCard, ReportFilters } from "@/api/types";
import { saveTextFile } from "@/download";
import { formatCurrency, formatHours, rangeLabel, type DateRange } from "@/format";
import { canSeeReports, canViewPayroll } from "@/gates";
import { useColors } from "@/theme";
import { ReportGrid, standardCards } from "@/report-grid";
import {
  Button,
  ConfirmDialog,
  DateRangeField,
  EmptyState,
  ErrorText,
  ListRow,
  Loading,
  PageTitle,
  Panel,
  Screen,
  Select,
  Sheet,
} from "@/ui";
import { useLookups, useWorkspace } from "@/workspace";

const standards = [
  { id: "summary", label: "Summary" },
  { id: "people", label: "People" },
  { id: "groups", label: "Group sessions" },
  { id: "staff", label: "Staff" },
];

function webOrigin() {
  return (process.env.EXPO_PUBLIC_WEB_URL || process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:3025").replace(/\/$/, "");
}

function queryFrom(filters: ReportFilters) {
  return {
    departmentId: filters.departmentId?.join(","),
    taskCategoryId: filters.taskCategoryId?.join(","),
    projectId: filters.projectId?.join(","),
    userId: filters.userId?.join(","),
    from: filters.from,
    to: filters.to,
  };
}

export default function ReportsScreen() {
  const workspace = useWorkspace();
  const colors = useColors();
  const client = useQueryClient();
  const { labels, organization, isAdmin, permissions } = workspace;
  const canDesign = isAdmin || permissions.includes("design_reports");
  const allowed = canSeeReports(workspace);
  const payrollAllowed = canViewPayroll(workspace);
  const { lookups } = useLookups();
  const saved = useQuery({
    queryKey: ["saved-reports", organization.id],
    queryFn: () => api.savedReports(organization.id),
    enabled: allowed,
  });
  const custom = (saved.data?.items ?? []).filter((item) => !item.isDashboard);
  const [selected, setSelected] = useState<string | null>(null);
  const active = selected ?? custom.find((item) => item.isDefault)?.id ?? "summary";
  const current = custom.find((item) => item.id === active);
  const [filters, setFilters] = useState<ReportFilters>({});
  useEffect(() => {
    if (current) setFilters(current.filters ?? {});
    // Reload stored filters when the saved report changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const report = useQuery({
    queryKey: ["report", organization.id, active, filters],
    queryFn: () => api.report(organization.id, queryFrom(filters)),
    enabled: allowed && active !== "payroll",
  });
  const payroll = useQuery({
    queryKey: ["payroll", organization.id, filters],
    queryFn: () => api.payroll(organization.id),
    enabled: allowed && payrollAllowed && active === "payroll",
  });
  const options = useMemo(
    () => [
      ...standards.map((item) => ({ value: item.id, label: item.label })),
      ...(payrollAllowed ? [{ value: "payroll", label: "Payroll" }] : []),
      ...custom.map((item) => ({ value: item.id, label: item.isDefault ? `${item.name} (default)` : item.name })),
    ],
    [custom, payrollAllowed],
  );
  const cards: ReportCard[] = current?.layout.cards?.length ? current.layout.cards : standardCards(active, labels);
  const save = useMutation({
    mutationFn: () => api.updateSavedReport(organization.id, current!.id, { filters }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["saved-reports", organization.id] }),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteSavedReport(organization.id, current!.id),
    onSuccess: async () => {
      setConfirmDelete(false);
      setSelected("summary");
      await client.invalidateQueries({ queryKey: ["saved-reports", organization.id] });
    },
  });

  async function download(kind: "time-entries.csv" | "summary.csv" | "view.csv" | "payroll.csv", filename: string) {
    try {
      setDownloadError(null);
      const text = await api.download(`/organizations/${organization.id}/${kind}`, queryFrom(filters));
      await saveTextFile(filename, text);
    } catch (error) {
      setDownloadError(error);
    }
  }

  if (!allowed) {
    return (
      <Screen>
        <PageTitle title="Reports" />
        <Panel>
          <EmptyState description="Ask an admin for report access." icon={BarChart3Icon} title="Reports are not available for your role" />
        </Panel>
      </Screen>
    );
  }
  if (saved.isLoading || (active !== "payroll" && report.isLoading)) return <Loading />;

  const range: DateRange = { from: filters.from, to: filters.to };
  const changed = current ? JSON.stringify(current.filters) !== JSON.stringify(filters) : false;

  return (
    <Screen>
      <PageTitle description={rangeLabel(range)} title="Reports" />
      <Select
        label="Report"
        onChange={(next) => {
          setSelected(next);
          const match = custom.find((item) => item.id === next);
          setFilters(match?.filters ?? {});
        }}
        options={options}
        value={options.some((item) => item.value === active) ? active : "summary"}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button label="Filters" onPress={() => setFiltersOpen(true)} variant="outline" />
        {current && canDesign && changed ? <Button label="Save filters" onPress={() => save.mutate()} pending={save.isPending} variant="outline" /> : null}
        {current && canDesign ? <Button label="Delete" onPress={() => setConfirmDelete(true)} variant="ghost" /> : null}
        {canDesign ? (
          <Button
            label="Edit on web"
            onPress={() => void WebBrowser.openBrowserAsync(current ? `${webOrigin()}/reports/${current.id}/design` : `${webOrigin()}/reports/new`)}
            variant="outline"
          />
        ) : null}
      </View>
      <ErrorText error={report.error ?? payroll.error ?? save.error ?? downloadError} />
      {active === "payroll" && payrollAllowed ? (
        <Panel>
          <View style={{ padding: 16, gap: 4 }}>
            <Text style={{ color: colors.cardForeground, fontWeight: "600" }}>
              {formatHours(payroll.data?.hours ?? 0)} · {formatCurrency(payroll.data?.grossPay ?? 0)}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
              {payroll.data?.people ?? 0} people · {payroll.data?.entries ?? 0} entries
            </Text>
          </View>
          {(payroll.data?.rows ?? []).map((row) => (
            <ListRow
              detail={`${row.group} · ${formatCurrency(row.payRate)}/h · ${row.entries} entries`}
              key={row.id}
              right={<Text style={{ color: colors.cardForeground }}>{formatCurrency(row.grossPay)}</Text>}
              title={`${row.person} · ${formatHours(row.hours)}`}
            />
          ))}
        </Panel>
      ) : (
        <ReportGrid cards={cards} data={report.data} />
      )}
      <View style={{ gap: 8 }}>
        <Button label="Download view CSV" onPress={() => void download("view.csv", "view.csv")} variant="outline" />
        <Button label="Download full volunteer log" onPress={() => void download("time-entries.csv", "time-entries.csv")} variant="outline" />
        <Button label="Download full summary" onPress={() => void download("summary.csv", "summary.csv")} variant="outline" />
        {payrollAllowed ? <Button label="Download payroll" onPress={() => void download("payroll.csv", "payroll.csv")} variant="outline" /> : null}
      </View>
      <Sheet onClose={() => setFiltersOpen(false)} open={filtersOpen} title="Filters">
        <DateRangeField onChange={(next) => setFilters((currentFilters) => ({ ...currentFilters, from: next.from, to: next.to }))} value={range} />
        <FilterChoices
          label={labels.department}
          onChange={(departmentId) => setFilters((currentFilters) => ({ ...currentFilters, departmentId }))}
          options={lookups.departments.map((item) => ({ id: item.id, label: item.name }))}
          selected={filters.departmentId ?? []}
        />
        <FilterChoices
          label={labels.taskCategory}
          onChange={(taskCategoryId) => setFilters((currentFilters) => ({ ...currentFilters, taskCategoryId }))}
          options={lookups.categories.map((item) => ({ id: item.id, label: item.name }))}
          selected={filters.taskCategoryId ?? []}
        />
        <FilterChoices
          label={labels.project}
          onChange={(projectId) => setFilters((currentFilters) => ({ ...currentFilters, projectId }))}
          options={lookups.projects.map((item) => ({ id: item.id, label: item.title }))}
          selected={filters.projectId ?? []}
        />
        <Button label="Clear" onPress={() => setFilters({})} variant="ghost" />
      </Sheet>
      <ConfirmDialog
        confirmLabel="Delete report"
        description="This removes the saved report. Standard reports stay available."
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        open={confirmDelete}
        pending={remove.isPending}
        title="Delete this report?"
      />
    </Screen>
  );
}

function FilterChoices({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.foreground, fontWeight: "500" }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <Button
              key={option.id}
              label={option.label}
              onPress={() => onChange(active ? selected.filter((id) => id !== option.id) : [...selected, option.id])}
              variant={active ? "default" : "outline"}
            />
          );
        })}
      </View>
    </View>
  );
}
