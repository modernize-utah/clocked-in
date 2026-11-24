import { Suspense } from "react";
import Link from "next/link";
import { TenantHome } from "@/components/tenant-home";
import { ShellSkeleton } from "@/components/shell/app-shell";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { buttonVariants } from "@/components/ui/button";
import { getAccess } from "@/lib/server/session";
import { requirePinnedTenantOrApex } from "@/lib/server/tenant";
import { cn } from "cn";

export default function Home() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <HomePage />
    </Suspense>
  );
}

async function HomePage() {
  const [access, pinned] = await Promise.all([getAccess(), requirePinnedTenantOrApex()]);
  if (!access) {
    return <MarketingHome isTenantHost={pinned.pinned} tenantName={pinned.tenant?.name ?? null} />;
  }

  return (
    <WorkspaceShell>
      <TenantHome />
    </WorkspaceShell>
  );
}

function MarketingHome({
  isTenantHost,
  tenantName,
}: {
  isTenantHost: boolean;
  tenantName: string | null;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6">
      <p className="text-xs font-semibold uppercase tracking-widest">{tenantName || "VolunTime"}</p>
      <h1 className="text-4xl font-semibold tracking-tight">Track volunteer time</h1>
      <p className="text-muted-foreground">
        Log hours, value them for grants, and let each tenant bring its own colors and marks.
      </p>
      <div className="flex gap-3">
        <Link href="/login" className={cn(buttonVariants())}>
          Sign in
        </Link>
        {!isTenantHost ? (
          <Link href="/signup" className={cn(buttonVariants({ variant: "outline" }))}>
            Create an account
          </Link>
        ) : null}
      </div>
    </main>
  );
}
