import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeletons";
import { requirePinnedTenantOrApex } from "@/lib/server/tenant";
import { NewTenantView } from "./new-tenant-view";

export const metadata: Metadata = { title: "New tenant" };

export default function NewTenantPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewTenantContent />
    </Suspense>
  );
}

async function NewTenantContent() {
  const pinned = await requirePinnedTenantOrApex();
  if (pinned.pinned) {
    redirect("/dashboard");
  }

  return <NewTenantView />;
}
