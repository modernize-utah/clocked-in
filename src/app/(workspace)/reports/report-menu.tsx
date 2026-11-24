"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MenuIcon } from "lucide-react";
import { toast } from "sonner";
import { deleteReportAction, updateReportAction } from "@/app/actions/reports";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import type { SavedReport } from "@/lib/api/features/saved-reports";
import { downloadTextFile } from "@/lib/download";
import { csvUrl, keys, payrollCsvUrl, summaryCsvUrl } from "@/lib/queries";
import { filtersEqual, filtersQuery, type ReportCard, type ReportFilters } from "@/lib/report-layout";
import { downloadReportPdf } from "@/lib/report-pdf/download";
import { viewCsvFromLayout } from "@/lib/report-view-csv";
import { lastReportStorageKey, newReportPath, reportPath, slugForSavedReport } from "@/lib/report-slug";

export function ReportMenu({
  active,
  title,
  filters,
  filterSummary,
  editHref,
  cards = [],
  data,
  saved,
  templateKey,
}: {
  active: string | null;
  title: string;
  filters: ReportFilters;
  filterSummary: string;
  editHref?: string | null;
  cards?: ReportCard[];
  data?: unknown;
  saved?: SavedReport | null;
  templateKey?: string | null;
}) {
  const router = useRouter();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const { isAdmin, permissions } = useWorkspace();
  const canDesign = isAdmin || permissions.includes("design_reports");
  const canExport = isAdmin || permissions.includes("export_reports");
  const canViewPayroll = permissions.includes("view_payroll");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const dirtyFilters = Boolean(saved) && !filtersEqual(filters, saved?.filters ?? {});

  async function saveFilters() {
    if (!saved) return;
    setSaving(true);
    const result = await updateReportAction(tenant.id, saved.id, { filters });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: keys.savedReports(tenant.id) });
    await queryClient.invalidateQueries({ queryKey: keys.savedReport(tenant.id, saved.id) });
    toast.success("Filters saved.");
  }

  async function deleteReport() {
    if (!saved || deleting) return;
    setDeleting(true);
    const result = await deleteReportAction(tenant.id, saved.id);
    setDeleting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    try {
      window.localStorage.removeItem(lastReportStorageKey(tenant.id));
    } catch {
      // Ignore storage access errors
    }
    const remaining =
      queryClient
        .getQueryData<SavedReport[]>(keys.savedReports(tenant.id))
        ?.filter((item) => item.id !== saved.id) ?? [];
    queryClient.setQueryData<SavedReport[]>(keys.savedReports(tenant.id), remaining);
    queryClient.removeQueries({ queryKey: keys.savedReport(tenant.id, saved.id) });
    await queryClient.invalidateQueries({ queryKey: keys.savedReports(tenant.id) });
    const nextDefault = remaining.find((item) => item.isDefault);
    router.replace(reportPath(nextDefault ? slugForSavedReport(nextDefault.name) : "summary"), { scroll: false });
    toast.success("Report deleted.");
  }

  async function downloadPdf() {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    const toastId = toast.loading("Preparing PDF…");
    try {
      await downloadReportPdf({
        title,
        slug: active ?? "report",
        tenant,
        filters,
        filterSummary,
        cards,
        data,
      });
      toast.success("PDF downloaded.", { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The PDF could not be created.", { id: toastId });
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon-lg" aria-label="Reports menu" />}>
          <MenuIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {canDesign && editHref ? <DropdownMenuItem render={<Link href={editHref} />}>Edit</DropdownMenuItem> : null}
          {canDesign ? (
            <DropdownMenuItem render={<Link href={newReportPath(filtersQuery(filters), templateKey)} />}>
              Create
            </DropdownMenuItem>
          ) : null}
          {canDesign && dirtyFilters ? (
            <DropdownMenuItem disabled={saving} onClick={() => void saveFilters()}>
              {saving ? "Saving filters…" : "Save filters"}
            </DropdownMenuItem>
          ) : null}
          {canDesign && saved ? (
            <DropdownMenuItem variant="destructive" disabled={deleting} onClick={() => setConfirmDeleteOpen(true)}>
              {deleting ? "Deleting…" : "Delete"}
            </DropdownMenuItem>
          ) : null}
          {canDesign ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onClick={() => downloadTextFile("report-view.csv", viewCsvFromLayout(cards, data ?? {}))}>
            Download CSV
          </DropdownMenuItem>
          {canExport ? (
            <DropdownMenuItem disabled={downloadingPdf} onClick={() => void downloadPdf()}>
              {downloadingPdf ? "Preparing PDF…" : "Download PDF"}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<a href={csvUrl(tenant.id, filters)} download="volunteer-log.csv" />}>
            Download Full Volunteer Log
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href={summaryCsvUrl(tenant.id, filters)} download="summary.csv" />}>
            Download Full Summary
          </DropdownMenuItem>
          {canViewPayroll && active === "payroll" ? (
            <DropdownMenuItem render={<a href={payrollCsvUrl(tenant.id, filters)} download="payroll.csv" />}>
              Download payroll
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Delete ${saved?.name ?? "this report"}?`}
        description="This custom report will be permanently removed."
        onConfirm={() => void deleteReport()}
      />
    </>
  );
}
