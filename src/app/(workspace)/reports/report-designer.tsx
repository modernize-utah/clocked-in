"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, ChartColumnIcon, CircleHelpIcon, FileQuestionIcon, HashIcon, InboxIcon, ListIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Field } from "@/components/field";
import { IconPickerDialog } from "@/components/icon-picker-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ReportGrid } from "@/components/report-grid";
import { DesignerSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsBelowLarge } from "@/hooks/use-mobile";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { useSavedReports } from "@/hooks/use-saved-reports";
import type { ReportTemplate } from "@/lib/api/features/report-templates";
import type { SavedReport } from "@/lib/api/features/saved-reports";
import {
  createReportAction,
  createReportTemplateAction,
  updateReportAction,
  updateReportTemplateAction,
} from "@/app/actions/reports";
import { formatPatterns } from "@/lib/number-pattern";
import { useReport } from "@/hooks/use-report";
import { useReportEntries, withEntries } from "@/hooks/use-report-entries";
import { keys, reportTemplateQuery, savedReportQuery } from "@/lib/queries";
import {
  dashboardLayout,
  emptyLayout,
  entriesLimitDefault, firstOpening,
  layoutError, reportLayoutAutosave, type ReportCard,
  type ReportLayout
} from "@/lib/report-layout";
import { scalarAccessors, seriesAccessors } from "@/lib/report-path";
import {
  designerLookupById,
  designerWaiting,
  isReportId,
  reportPath,
  slugForSavedReport,
  standardSlugForKey,
} from "@/lib/report-slug";
import { cn } from "cn";
import { PreviewZoom, useDesignerPreferences, zoomSteps } from "./designer-preferences";
import { CardFields } from "./card-fields";
import { ReportSetup, useTemplateChoices } from "./report-setup";
import { EmptyState } from "@/components/empty-state";

/** Debounced autosave. Saves run one at a time so a slow create cannot race a second create. */
function useArrangeSave(enabled: boolean, layout: ReportLayout, save: (layout: ReportLayout) => Promise<void>) {
  const latest = useRef({ layout, save });
  const saved = useRef<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const enqueue = useCallback((next: ReportLayout) => {
    const run = queue.current.then(() => latest.current.save(next));
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  useEffect(() => {
    latest.current = { layout, save };
  });

  useEffect(() => {
    if (!enabled) return;
    const current = JSON.stringify(layout);
    if (saved.current === null) {
      saved.current = current;
      return;
    }
    if (saved.current === current) return;
    const handle = window.setTimeout(() => {
      const next = latest.current.layout;
      const text = JSON.stringify(next);
      void enqueue(next)
        .then(() => {
          saved.current = text;
        })
        .catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [enabled, enqueue, layout]);

  useEffect(() => {
    return () => {
      if (!enabled || saved.current === null) return;
      const next = latest.current.layout;
      if (JSON.stringify(next) === saved.current) return;
      void enqueue(next).catch(() => undefined);
    };
  }, [enabled, enqueue]);
}

function ArrangeCanvas({
  mode,
  report,
  template,
  dashboard = false,
}: {
  mode: "report" | "template";
  report?: SavedReport;
  template?: ReportTemplate;
  dashboard?: boolean;
}) {
  const tenant = useTenant();
  const { isAdmin, viewer } = useWorkspace();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { choices, templates } = useTemplateChoices();
  const initialLayout = mode === "report" ? report!.layout : template!.layout;
  const [layout, setLayout] = useState<ReportLayout>(initialLayout);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [resetChoice, setResetChoice] = useState<ReportTemplate | "blank" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialLayout.cards[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const { editorOpen, zoom, setEditorOpen, setZoom } = useDesignerPreferences();
  const compact = useIsBelowLarge();
  const previewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const reportIdRef = useRef(report?.id ?? "");

  const persist = useCallback(
    async (nextLayout: ReportLayout) => {
      const problem = layoutError(nextLayout);
      if (problem) {
        setError(problem);
        throw new Error(problem);
      }

      if (mode === "report") {
        if (!reportIdRef.current) {
          const result = await createReportAction(tenant.id, {
            name: report?.name || "Dashboard",
            isDashboard: dashboard,
            layout: nextLayout,
            ...(dashboard ? {} : { filters: report?.filters ?? {} }),
          });
          if (!result.ok || !result.data) throw new Error(result.ok ? "The report could not be saved." : result.error);
          reportIdRef.current = result.data.id;
          await queryClient.invalidateQueries({ queryKey: keys.savedReports(tenant.id) });
          await queryClient.invalidateQueries({ queryKey: keys.savedReport(tenant.id, result.data.id) });
        } else {
          const result = await updateReportAction(tenant.id, reportIdRef.current, reportLayoutAutosave(nextLayout));
          if (!result.ok) throw new Error(result.error);
          await queryClient.invalidateQueries({ queryKey: keys.savedReports(tenant.id) });
          await queryClient.invalidateQueries({ queryKey: keys.savedReport(tenant.id, reportIdRef.current) });
        }
      } else if (template!.scope === "global" && !viewer.isSuperAdmin) {
        const result = await createReportTemplateAction(tenant.id, {
          name: template!.name,
          layout: nextLayout,
          baseTemplateId: template!.id,
        });
        if (!result.ok || !result.data) throw new Error(result.ok ? "The template could not be saved." : result.error);
        await queryClient.invalidateQueries({ queryKey: keys.reportTemplates(tenant.id) });
        router.replace(`/reports/templates/${result.data.id}/design`);
      } else {
        const result = await updateReportTemplateAction(tenant.id, template!.id, { layout: nextLayout });
        if (!result.ok) throw new Error(result.error);
        await queryClient.invalidateQueries({ queryKey: keys.reportTemplates(tenant.id) });
        await queryClient.invalidateQueries({ queryKey: keys.reportTemplate(tenant.id, template!.id) });
      }

      setError(null);
    },
    [dashboard, mode, tenant.id, queryClient, report, router, template, viewer.isSuperAdmin],
  );

  useArrangeSave(true, layout, persist);

  useEffect(() => {
    const frame = previewRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;
    const measure = () => {
      setFrameWidth(frame.clientWidth);
      setContentHeight(content.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(content);
    return () => observer.disconnect();
  }, [layout]);

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const index = zoomSteps.indexOf(zoom);
      if (index === -1) return;
      const next = zoomSteps[index + (event.deltaY > 0 ? -1 : 1)];
      if (next) setZoom(next);
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [setZoom, zoom]);

  const preview = useReport({});
  const { entries } = useReportEntries();
  const previewData = withEntries(preview.data, entries);
  const selected = layout.cards.find((card) => card.id === selectedId) ?? null;
  const paths = selected?.kind === "value" ? scalarAccessors : seriesAccessors;
  const tenantVersion = templates.data?.find((item) => item.baseTemplateId === template?.id);
  const saveTemplate = useMutation({
    mutationFn: async () => {
      const problem = layoutError(layout);
      if (problem) throw new Error(problem);
      const result = await createReportTemplateAction(tenant.id, { name: templateName, layout });
      if (!result.ok) throw new Error(result.error);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.reportTemplates(tenant.id) });
      setSaveTemplateOpen(false);
      setTemplateName("");
      setError(null);
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "The template could not be saved."),
  });

  function patch(id: string, change: Partial<ReportCard>) {
    setLayout((current) => ({
      version: 1,
      cards: current.cards.map((card) => (card.id === id ? ({ ...card, ...change } as ReportCard) : card)),
    }));
  }

  function addCard(kind: ReportCard["kind"]) {
    const columns = kind === "value" ? 3 : kind === "entries" ? 12 : 6;
    const rows = kind === "value" ? 1 : kind === "chart" ? 4 : 5;
    const spot = firstOpening(layout.cards, columns, rows);
    if (!spot) {
      setError("There is no open space for that card.");
      return;
    }

    const card: ReportCard =
      kind === "value"
        ? {
            id: crypto.randomUUID(),
            kind,
            title: "Value",
            description: "",
            accessor: "user.hours",
            color: "primary",
            format: "hours",
            pattern: formatPatterns.hours,
            icon: "clock",
            ...spot,
          }
        : kind === "list"
          ? {
              id: crypto.randomUUID(),
              kind,
              title: "List",
              description: "",
              accessor: "user.byProject",
              format: "hours",
              pattern: formatPatterns.hours,
              visibleColumns: ["name", "hours", "share", "inKind"],
              ...spot,
            }
          : kind === "entries"
            ? {
                id: crypto.randomUUID(),
                kind,
                title: "Recent entries",
                description: "",
                accessor: "entries.mine",
                scope: "mine",
                limit: entriesLimitDefault,
                ...spot,
              }
            : {
                id: crypto.randomUUID(),
                kind,
                title: "Chart",
                description: "",
                accessor: "user.byOrganization",
                chartType: "column",
                palette: "single",
                valueKey: "hours",
                format: "hours",
                pattern: formatPatterns.hours,
                ...spot,
              };
    setError(null);
    setLayout((current) => ({ version: 1, cards: [...current.cards, card] }));
    setSelectedId(card.id);
    setEditorOpen(true);
  }

  function applyReset() {
    if (!resetChoice) return;
    const next = resetChoice === "blank" ? emptyLayout() : resetChoice.layout;
    setLayout(next);
    setSelectedId(next.cards[0]?.id ?? null);
    if (next.cards[0]) setEditorOpen(true);
    setResetChoice(null);
  }

  const problem = layoutError(layout);
  const templateNote =
    mode === "template" && template
      ? template.scope === "override"
        ? "This is your tenant's version."
        : template.scope === "global" && viewer.isSuperAdmin
          ? "Editing the global template."
          : "Saving creates your tenant's version of this template."
      : null;

  const editorBody = (
    <>
    {selected ? (
      <CardFields
        card={selected}
        paths={paths}
        onPatch={(change) => patch(selected.id, change)}
        onPickIcon={() => setIconPickerOpen(true)}
        onDelete={() => {
          setLayout((current) => ({ version: 1, cards: current.cards.filter((card) => card.id !== selected.id) }));
          setSelectedId(null);
        }}
      />
    ) : (
      <p className="text-sm text-muted-foreground">Select a card to edit its title, color, and data.</p>
    )}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className={cn("grid min-h-0 flex-1 gap-3", editorOpen && !compact && "grid-cols-[minmax(0,1fr)_18rem]")}>
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <div className="min-w-0">
              <Link
                href={
                  dashboard
                    ? "/dashboard"
                    : mode === "template"
                      ? reportPath(standardSlugForKey(template?.key) ?? "summary")
                      : report?.name
                        ? reportPath(slugForSavedReport(report.name))
                        : "/reports"
                }
                className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
              >
                <ArrowLeftIcon className="size-4" />
                {dashboard ? "Dashboard" : "Reports"}
              </Link>
              {templateNote ? <p className="text-xs text-muted-foreground">{templateNote}</p> : null}
              {mode === "template" && template?.scope === "global" && viewer.isSuperAdmin && tenantVersion ? (
                <Link href={`/reports/templates/${tenantVersion.id}/design`} className="text-xs underline">
                  Edit tenant version
                </Link>
              ) : null}
              {mode === "template" && template?.scope === "override" && template.baseTemplateId && viewer.isSuperAdmin ? (
                <Link href={`/reports/templates/${template.baseTemplateId}/design`} className="text-xs underline">
                  Edit global
                </Link>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {preview.isFetching ? <p className="text-xs text-muted-foreground">Updating…</p> : null}
              <Button type="button" variant="outline" size="icon" aria-label="Add value card" onClick={() => addCard("value")}>
                <HashIcon />
              </Button>
              <Button type="button" variant="outline" size="icon" aria-label="Add chart card" onClick={() => addCard("chart")}>
                <ChartColumnIcon />
              </Button>
              <Button type="button" variant="outline" size="icon" aria-label="Add list card" onClick={() => addCard("list")}>
                <ListIcon />
              </Button>
              <Button type="button" variant="outline" size="icon" aria-label="Add entries card" onClick={() => addCard("entries")}>
                <InboxIcon />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button type="button" variant="outline" />}>Reset</DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setResetChoice("blank")}>Blank</DropdownMenuItem>
                  {choices.map((item) => (
                    <DropdownMenuItem key={item.id} onClick={() => setResetChoice(item)}>
                      {item.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {mode === "report" && isAdmin ? (
                <Button type="button" variant="outline" onClick={() => setSaveTemplateOpen(true)}>
                  Save as template
                </Button>
              ) : null}
              <PreviewZoom zoom={zoom} onZoom={setZoom} />
              <Button type="button" variant="ghost" size="icon" aria-label="Report builder instructions" onClick={() => setHelpOpen(true)}>
                <CircleHelpIcon />
              </Button>
            </div>
          </div>
          <div ref={previewRef} className="min-h-0 flex-1 overflow-auto bg-muted/40 p-3">
            <div style={{ width: frameWidth ? frameWidth * zoom : "100%", height: contentHeight ? contentHeight * zoom : undefined }}>
              <div ref={contentRef} style={{ width: frameWidth || "100%", transform: `scale(${zoom})`, transformOrigin: "top left" }}>
                {layout.cards.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Add a card, or reset to a template.</p>
                ) : null}
                <ReportGrid
                  cards={layout.cards}
                  data={previewData}
                  editing
                  scroll={false}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setEditorOpen(true);
                  }}
                  onChange={(cards) => setLayout({ version: 1, cards })}
                />
              </div>
            </div>
          </div>
        </section>
        {editorOpen && !compact ? (
          <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Card editor</h2>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setEditorOpen(false)}>
                <XIcon />
              </Button>
            </div>
            {editorBody}
          </aside>
        ) : null}
      </div>
      {compact ? (
        <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
          <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto p-4">
            <SheetHeader className="p-0">
              <SheetTitle>Card editor</SheetTitle>
            </SheetHeader>
            {editorBody}
          </SheetContent>
        </Sheet>
      ) : null}
      {error ? <p className="shrink-0 text-sm text-destructive">{error}</p> : null}
      {problem ? <p className="shrink-0 text-sm text-destructive">{problem}</p> : null}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="flex max-h-[min(40rem,85vh)] flex-col overflow-hidden sm:max-w-xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>Report builder</DialogTitle>
            <DialogDescription>How to arrange cards and save this report.</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto text-sm">
            <p><span className="font-medium">Layout. </span>Drag a card to move it. Drag the top, right, bottom, or left edge to resize it. Cards cannot overlap.</p>
            <p><span className="font-medium">Cards. </span>The header icons add a value, chart, or list card. Reset replaces every card with Blank or a template after confirmation. Click a card to select it and open the card editor. The editor edits title, description, data, and format, plus color and icon for a value, chart type, palette, and value for a chart, or columns for a list. Delete removes the selected card. The close icon hides the editor; clicking a card opens it again.</p>
            <p><span className="font-medium">Preview. </span>Zoom with the header controls, the percentage (resets to 100%), or Ctrl/Cmd + scroll over the preview. The preview uses all-time tenant data and shows Updating while data reloads. Date range and other filters live on the report page.</p>
            <p><span className="font-medium">Report. </span>Name, default, and the starting layout are chosen before the preview opens. Card and layout changes save automatically. An tenant admin can save the layout as an tenant template. A SuperAdmin edits a global template. An tenant admin who saves a global template creates an override that replaces it for this tenant.</p>
          </div>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={resetChoice !== null}
        onOpenChange={(open) => {
          if (!open) setResetChoice(null);
        }}
        title="Reset the layout?"
        description={
          resetChoice === "blank"
            ? "The current cards will be replaced with a blank layout."
            : `The current cards will be replaced with ${resetChoice?.name ?? "this template"}.`
        }
        confirmLabel="Reset"
        onConfirm={applyReset}
      />
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>This layout is saved for your tenant. Reports that already use a copy do not change.</DialogDescription>
          </DialogHeader>
          <Field label="Name" htmlFor="template-name">
            <Input id="template-name" value={templateName} maxLength={80} onChange={(event) => setTemplateName(event.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveTemplateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saveTemplate.isPending} onClick={() => saveTemplate.mutate()}>
              {saveTemplate.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <IconPickerDialog
        open={iconPickerOpen}
        onOpenChange={setIconPickerOpen}
        onSelect={(icon) => {
          if (selected?.kind === "value") patch(selected.id, { icon });
        }}
      />
    </div>
  );
}

export function ReportDesigner({ reportSlug, dashboard = false }: { reportSlug?: string; dashboard?: boolean }) {
  const tenant = useTenant();
  const router = useRouter();
  const { reports, isPending } = useSavedReports();
  const listed = reports.find(
    (item) => item.id === reportSlug || slugForSavedReport(item.name) === reportSlug,
  );
  const lookupById = designerLookupById(reportSlug, Boolean(listed));
  const existing = useQuery({
    ...savedReportQuery(tenant.id, reportSlug ?? ""),
    enabled: lookupById && !isPending,
  });
  const report = listed ?? existing.data ?? null;

  useEffect(() => {
    if (!reportSlug || !report || !isReportId(reportSlug)) return;
    const slug = slugForSavedReport(report.name);
    if (slug !== reportSlug) router.replace(`/reports/${slug}/design`);
  }, [report, reportSlug, router]);

  if (dashboard) {
    if (isPending) return <DesignerSkeleton />;
    const saved = reports.find((item) => item.isDashboard);
    if (saved) return <ArrangeCanvas key={saved.id} mode="report" report={saved} dashboard />;
    return (
      <ArrangeCanvas
        key="dashboard-draft"
        mode="report"
        dashboard
        report={{
          id: "",
          tenantId: tenant.id,
          name: "Dashboard",
          isDefault: false,
          isDashboard: true,
          layout: dashboardLayout(),
          filters: {},
          createdAt: "",
          updatedAt: "",
        }}
      />
    );
  }

  if (!reportSlug) return <ReportSetup />;
  if (
    designerWaiting({
      listPending: isPending,
      foundInList: Boolean(listed),
      lookupEnabled: lookupById,
      lookupPending: existing.isPending,
    })
  ) {
    return <DesignerSkeleton />;
  }
  if (!report) {
    return <EmptyState icon={FileQuestionIcon} title="That report is not available" description="It may have been renamed or deleted." />;
  }

  return <ArrangeCanvas key={report.id} mode="report" report={report} />;
}

export function TemplateDesigner({ templateId }: { templateId: string }) {
  const tenant = useTenant();
  const existing = useQuery(reportTemplateQuery(tenant.id, templateId));

  if (existing.isPending) return <DesignerSkeleton />;
  if (existing.isError || !existing.data) {
    return <EmptyState icon={FileQuestionIcon} title="That template is not available" description="It may have been deleted." />;
  }

  return <ArrangeCanvas key={existing.data.id} mode="template" template={existing.data} />;
}
