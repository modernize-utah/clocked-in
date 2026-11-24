"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, MailIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenant } from "@/hooks/use-workspace";
import { emailForLabels } from "@/lib/email/templates";
import { emailTemplatesQuery } from "@/lib/queries";

const updatedFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export function EmailTemplatesView() {
  const tenant = useTenant();
  const { data, isPending, isError, refetch } = useQuery(emailTemplatesQuery(tenant.id));
  if (isPending) return <PageSkeleton rows={6} />;
  if (isError || !data || data.length === 0) {
    return (
      <EmptyState
        icon={MailIcon}
        title="Email templates did not load"
        description="Every tenant starts with a full set. Try again in a moment."
        action={
          <Button type="button" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Templates</CardTitle>
        <CardDescription>
          Every email {tenant.name} sends. Edit the wording; the VolunTime header and footer stay the same.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {data.map((template) => (
            <li key={template.id}>
              <Link
                href={`/settings/email-templates/${template.id}`}
                className="flex items-center gap-3 px-6 py-3 text-sm transition-colors hover:bg-muted/60"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{template.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {emailForLabels[template.for]} · v{template.version} · Updated{" "}
                    {updatedFormat.format(new Date(template.updatedAt))}
                  </span>
                </div>
                {template.isOptional ? (
                  <Badge variant={template.isEnabled ? "secondary" : "outline"}>{template.isEnabled ? "On" : "Off"}</Badge>
                ) : null}
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
