"use client";

import { BuildingIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspace } from "@/hooks/use-workspace";

export function NoTenant() {
  const { isTenantHost, pinnedTenantName } = useWorkspace();

  if (isTenantHost) {
    return (
      <Card className="mx-auto w-full max-w-lg gap-6 py-6 [--card-spacing:--spacing(6)]">
        <CardHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BuildingIcon className="size-5" />
          </div>
          <CardTitle className="text-xl font-semibold">
            {pinnedTenantName ? `${pinnedTenantName} is invite-only` : "Tenant unavailable"}
          </CardTitle>
          <CardDescription>
            Your account does not have an active membership in this tenant.{" "}
            <Link href="/accept" className="font-medium">
              Accept an invite
            </Link>{" "}
            if you have a code.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-lg gap-6 py-6 [--card-spacing:--spacing(6)]">
      <CardHeader>
        <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BuildingIcon className="size-5" />
        </div>
        <CardTitle className="text-xl font-semibold">Set up your tenant</CardTitle>
        <CardDescription>
          Create the tenant you log time for, or{" "}
          <Link href="/accept" className="font-medium">
            accept an invite
          </Link>{" "}
          to join an existing one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/tenant/new" className={buttonVariants({ size: "lg" })}>
          Create tenant
        </Link>
      </CardContent>
    </Card>
  );
}
