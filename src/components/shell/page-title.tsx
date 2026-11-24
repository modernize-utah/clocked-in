"use client";

import { usePathname } from "next/navigation";
import { ReportSwitcher } from "@/app/(workspace)/reports/report-switcher";
import { useWorkspace } from "@/hooks/use-workspace";
import { isReportViewerPath } from "@/lib/report-slug";
import { viewTitle } from "@/lib/view-title";

export function HeaderTitle() {
  const pathname = usePathname();
  const { viewer, tenant } = useWorkspace();
  const title = viewTitle(pathname ?? "", viewer.name, tenant?.name);
  if (!title) return null;

  if (isReportViewerPath(pathname ?? "")) {
    return (
      <h1 className="hidden min-w-0 flex-1 items-center lg:flex">
        <ReportSwitcher />
      </h1>
    );
  }

  return (
    <h1 className="hidden min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight lg:block">{title}</h1>
  );
}
