"use client";

import { usePathname } from "next/navigation";
import { cn } from "cn";
import { ReportSwitcher } from "@/app/(workspace)/reports/report-switcher";
import { useWorkspace } from "@/hooks/use-workspace";
import { isReportViewerPath } from "@/lib/report-slug";
import { viewTitle } from "@/lib/view-title";

export function PageHeader({
  description,
  actions,
  className,
  inline = false,
}: {
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** Keep the title and actions on one row, including narrow screens. */
  inline?: boolean;
}) {
  const pathname = usePathname();
  const { viewer, organization } = useWorkspace();
  const title = viewTitle(pathname ?? "", viewer.name, organization?.name);
  const hasSupport = Boolean(description || actions);
  const showSwitcher = isReportViewerPath(pathname ?? "");

  return (
    <div
      className={cn(
        inline
          ? "flex flex-row items-center justify-between gap-3"
          : "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        !hasSupport && "lg:hidden",
        className,
      )}
    >
      <div className={cn("min-w-0", inline && "flex-1", !description && "lg:hidden")}>
        <h1 className="flex min-w-0 items-center truncate text-2xl font-semibold tracking-tight lg:hidden">
          {showSwitcher ? <ReportSwitcher /> : title}
        </h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground lg:mt-0">{description}</p> : null}
      </div>
      {actions ? <div className={cn("flex flex-wrap items-center gap-2", inline && "shrink-0")}>{actions}</div> : null}
    </div>
  );
}
