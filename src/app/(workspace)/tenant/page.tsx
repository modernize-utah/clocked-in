import type { Metadata } from "next";
import { TenantView } from "./tenant-view";

export const metadata: Metadata = { title: "Tenant" };

export default function TenantPage() {
  return <TenantView />;
}
