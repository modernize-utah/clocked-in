"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { MarkdownView } from "@/components/markdown-view";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLabels } from "@/hooks/use-labels";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { brandAssetSrc, wordmarkSrc } from "@/lib/brand";
import { formatCurrency } from "@/lib/format";
import { websiteHref } from "@/lib/url";

export function TenantHome() {
  const tenant = useTenant();
  const { isAdmin } = useWorkspace();
  const copy = useLabels();
  const markUrl = brandAssetSrc("mark", tenant.markUrl);
  const wordmarkUrl = wordmarkSrc(tenant, "light");
  const website = tenant.websiteUrl ? websiteHref(tenant.websiteUrl) : null;
  const facts = [
    ["Volunteer hourly rate", formatCurrency(tenant.volunteerHourlyRate)],
    ["Default rate", tenant.defaultRateType],
    ["Time entry editing", tenant.preferences.allowTimeEntryEditing ? "Allowed" : "Locked after save"],
    ["Theme", tenant.theme.name],
    [
      "Names in the app",
      [
        tenant.preferences.entityLabels.tenant,
        tenant.preferences.entityLabels.project,
        tenant.preferences.entityLabels.organization,
        tenant.preferences.entityLabels.taskCategory,
      ].join(", "),
    ],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {markUrl ? (
            <img src={markUrl} alt="" width={56} height={56} className="size-14 shrink-0 rounded-xl object-contain" />
          ) : null}
          <div className="min-w-0">
            {wordmarkUrl ? (
              <img src={wordmarkUrl} alt="" className="mb-2 h-8 max-w-56 object-contain object-left" />
            ) : null}
            <h1 className="truncate text-3xl font-semibold tracking-tight">{tenant.name}</h1>
            {website ? (
              <a
                href={website}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex max-w-full items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
              >
                <span className="truncate">{tenant.websiteUrl}</span>
                <ExternalLinkIcon className="size-3.5 shrink-0" />
              </a>
            ) : null}
          </div>
        </div>
        {isAdmin ? (
          <Link href="/tenant" className={buttonVariants({ variant: "outline" })}>
            Edit {copy.tenant.toLowerCase()}
          </Link>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          {tenant.description?.trim() ? (
            <MarkdownView source={tenant.description} />
          ) : (
            <p className="text-sm text-muted-foreground">No description yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label} className={label === "Names in the app" ? "min-w-0 sm:col-span-2 lg:col-span-3" : "min-w-0"}>
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
                <dd className="mt-1 text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
