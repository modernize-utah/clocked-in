"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { MarkdownView } from "@/components/markdown-view";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLabels } from "@/hooks/use-labels";
import { useOrganization, useWorkspace } from "@/hooks/use-workspace";
import { brandAssetSrc, wordmarkSrc } from "@/lib/brand";
import { formatCurrency } from "@/lib/format";
import { websiteHref } from "@/lib/url";

export function OrganizationHome() {
  const organization = useOrganization();
  const { isAdmin } = useWorkspace();
  const copy = useLabels();
  const markUrl = brandAssetSrc("mark", organization.markUrl);
  const wordmarkUrl = wordmarkSrc(organization, "light");
  const website = organization.websiteUrl ? websiteHref(organization.websiteUrl) : null;
  const facts = [
    ["Volunteer hourly rate", formatCurrency(organization.volunteerHourlyRate)],
    ["Default rate", organization.defaultRateType],
    ["Time entry editing", organization.preferences.allowTimeEntryEditing ? "Allowed" : "Locked after save"],
    ["Theme", organization.theme.name],
    [
      "Names in the app",
      [
        organization.preferences.entityLabels.organization,
        organization.preferences.entityLabels.project,
        organization.preferences.entityLabels.department,
        organization.preferences.entityLabels.taskCategory,
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
            <h1 className="truncate text-3xl font-semibold tracking-tight">{organization.name}</h1>
            {website ? (
              <a
                href={website}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex max-w-full items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
              >
                <span className="truncate">{organization.websiteUrl}</span>
                <ExternalLinkIcon className="size-3.5 shrink-0" />
              </a>
            ) : null}
          </div>
        </div>
        {isAdmin ? (
          <Link href="/organization" className={buttonVariants({ variant: "outline" })}>
            Edit {copy.organization.toLowerCase()}
          </Link>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          {organization.description?.trim() ? (
            <MarkdownView source={organization.description} />
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
