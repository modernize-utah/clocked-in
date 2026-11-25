"use client";

import { usePathname } from "next/navigation";
import { NoTenant } from "@/components/no-tenant";
import { useWorkspace } from "@/hooks/use-workspace";

const apexAllowedWithoutOrg = ["/profile", "/feedback", "/tenant/new"];
const tenantAllowedWithoutOrg = ["/profile"];

export function TenantGate({ children }: { children: React.ReactNode }) {
  const { tenant, isTenantHost } = useWorkspace();
  const pathname = usePathname();
  const allowed = isTenantHost ? tenantAllowedWithoutOrg : apexAllowedWithoutOrg;
  if (!tenant && !allowed.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return <NoTenant />;
  }

  return children;
}
