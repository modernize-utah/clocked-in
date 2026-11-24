"use client";

import { NoTenant } from "@/components/no-tenant";
import { SectionLayout } from "@/components/section-layout";
import { PageSkeleton } from "@/components/skeletons";
import { useClientRedirect } from "@/hooks/use-client-redirect";
import { useWorkspace } from "@/hooks/use-workspace";
import { DeveloperNav } from "./developer-nav";

export function DeveloperShell({ children }: { children: React.ReactNode }) {
  const { tenant, isAdmin } = useWorkspace();
  useClientRedirect(Boolean(tenant) && !isAdmin, "/dashboard");
  if (!tenant) return <NoTenant />;
  if (!isAdmin) return <PageSkeleton />;
  return <SectionLayout nav={<DeveloperNav />}>{children}</SectionLayout>;
}
