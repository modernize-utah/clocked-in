"use client";

import { usePathname } from "next/navigation";
import { cn } from "cn";

function isReportDesigner(pathname: string) {
  return (
    pathname === "/reports/new" ||
    pathname === "/dashboard/design" ||
    /^\/reports\/[^/]+\/design$/.test(pathname) ||
    /^\/reports\/templates\/[^/]+\/design$/.test(pathname)
  );
}

export function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const wide = isReportDesigner(pathname);
  const locked = !wide && (pathname === "/log" || pathname.startsWith("/log/"));

  return (
    <div
      data-shell-frame
      className={cn(
        "mx-auto flex min-h-0 w-full flex-1 flex-col p-4 sm:p-6 lg:p-8",
        wide
          ? "overflow-hidden"
          : locked
            ? "max-w-7xl overflow-hidden"
            : "max-w-7xl gap-6 overflow-y-auto overscroll-y-contain",
      )}
    >
      {children}
    </div>
  );
}
