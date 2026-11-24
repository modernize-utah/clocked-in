import type { Metadata } from "next";
import { TenantForm } from "./tenant-form";

export const metadata: Metadata = { title: "Tenant settings" };

export default function TenantSettingsPage() {
  return <TenantForm />;
}
