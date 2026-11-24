"use client";

import { brandAssetSrc } from "@/lib/brand";
import { downloadBlob } from "@/lib/download";
import type { ChartPaletteSource } from "@/lib/chart-palette";
import type { ReportCard, ReportFilters } from "@/lib/report-layout";
import { paginatePdfBlocks, reportPdfBlocks } from "./blocks";
import { capturePdfCharts } from "./capture";
import { reportPdfFilename } from "./filename";
import { pageContentHeight } from "./layout";
import type { Tenant } from "@/lib/types";

export type ReportPdfInput = {
  title: string;
  slug: string;
  tenant: Pick<Tenant, "name" | "markUrl" | "theme">;
  filters: ReportFilters;
  filterSummary: string;
  cards: ReportCard[];
  data: unknown;
};

async function fetchDataUrl(src: string) {
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function themeColors(theme: ChartPaletteSource & { primary: string; foreground: string }) {
  return {
    primary: theme.primary,
    foreground: theme.foreground,
    muted: "#4a4a4a",
    line: "#e5e5e5",
  };
}

export async function downloadReportPdf(input: ReportPdfInput) {
  const captured = await capturePdfCharts(reportPdfBlocks(input.cards, input.data, input.tenant.theme));
  const blocks = paginatePdfBlocks(captured, pageContentHeight - 80).flat();
  const logoSrc = brandAssetSrc("mark", input.tenant.markUrl);
  const logo = logoSrc ? await fetchDataUrl(logoSrc) : null;
  const [{ pdf }, { ReportPdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./document"),
  ]);
  const blob = await pdf(
    <ReportPdfDocument
      title={input.title}
      tenantName={input.tenant.name}
      logoSrc={logo}
      filterSummary={input.filterSummary}
      blocks={blocks}
      colors={themeColors(input.tenant.theme)}
    />,
  ).toBlob();
  downloadBlob(reportPdfFilename(input.slug, input.filters), blob, "application/pdf");
}
