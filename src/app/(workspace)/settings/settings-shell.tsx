"use client";

import { usePathname } from "next/navigation";
import { NoTenant } from "@/components/no-tenant";
import { SectionLayout } from "@/components/section-layout";
import { PageSkeleton } from "@/components/skeletons";
import { useClientRedirect } from "@/hooks/use-client-redirect";
import { useWorkspace } from "@/hooks/use-workspace";
import { SettingsNav } from "./settings-nav";

const coordinatorSettings = new Set(["/settings/lists"]);

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { tenant, isAdmin, isCoordinator } = useWorkspace();
  const allowed = isAdmin || (isCoordinator && coordinatorSettings.has(pathname));
  useClientRedirect(Boolean(tenant) && !isAdmin && !isCoordinator, "/dashboard");
  useClientRedirect(Boolean(tenant) && isCoordinator && !isAdmin && !coordinatorSettings.has(pathname), "/settings/lists");
  if (!tenant) return <NoTenant />;
  if (!allowed) return <PageSkeleton />;
  return <SectionLayout nav={<SettingsNav />}>{children}</SectionLayout>;
}
