"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, MailIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { updateTenantEmailSettingsAction } from "@/app/actions/tenants";
import { EmptyState } from "@/components/empty-state";
import { Field, FormMessage } from "@/components/field";
import { SelectField, type Option } from "@/components/select-field";
import { PageSkeleton } from "@/components/skeletons";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenant } from "@/hooks/use-workspace";
import {
  defaultEmailSettings,
  emailForLabels,
  emailTemplateBadge,
  type BooleanEmailSettingKey,
  type TimeEmailFrequency,
} from "@/lib/email/templates";
import { emailTemplatesQuery } from "@/lib/queries";

const updatedFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

const frequencyOptions: Option[] = [
  { value: "immediate", label: "Immediately" },
  { value: "weekly", label: "Weekly digest" },
  { value: "off", label: "Off" },
];

const booleanEmailItems: { key: BooleanEmailSettingKey; label: string; description: string }[] = [
  {
    key: "AccessRequestReceived",
    label: "Access request (admins)",
    description: "Email tenant admins when someone requests more access.",
  },
  {
    key: "AccessRequestDecided",
    label: "Access request decided",
    description: "Email the requester when their access request is approved or declined.",
  },
  {
    key: "NeedSubmitted",
    label: "Need submitted (admins)",
    description: "Email tenant admins when a volunteer need is submitted for approval.",
  },
  {
    key: "NeedDecided",
    label: "Need decided",
    description: "Email the creator when their volunteer need is published or rejected.",
  },
  {
    key: "VolunteerMessage",
    label: "Message to volunteers",
    description: "Allow sending messages to volunteers who signed up for a need.",
  },
  {
    key: "FeedbackReceived",
    label: "Feedback received",
    description: "Email the submitter confirming their feedback or bug report was received.",
  },
  {
    key: "FeedbackNotify",
    label: "New feedback (admins)",
    description: "Email designated recipients when someone submits feedback.",
  },
  {
    key: "FeedbackCompleted",
    label: "Feedback completed",
    description: "Email the submitter when their feedback is resolved or closed.",
  },
];

export function EmailSettingsView() {
  const tenant = useTenant();
  return (
    <Tabs defaultValue="delivery">
      <TabsList variant="line">
        <TabsTrigger value="delivery">Delivery</TabsTrigger>
        <TabsTrigger value="templates">Templates</TabsTrigger>
      </TabsList>
      <TabsContent value="delivery" className="mt-4">
        <EmailSendSettingsCard key={tenant.id} />
      </TabsContent>
      <TabsContent value="templates" className="mt-4">
        <EmailTemplatesCard />
      </TabsContent>
    </Tabs>
  );
}

function EmailSendSettingsCard() {
  const tenant = useTenant();
  const saved = tenant.preferences.emailSettings ?? defaultEmailSettings;
  const [loggedTime, setLoggedTime] = useState<TimeEmailFrequency>(saved.LoggedTime);
  const [unclassifiedEntry, setUnclassifiedEntry] = useState<TimeEmailFrequency>(saved.UnclassifiedEntry);
  const [result, action] = useActionState(
    updateTenantEmailSettingsAction.bind(null, tenant.id),
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>When emails are sent</CardTitle>
        <CardDescription>
          Control how often time-logging notifications are sent and which activity emails are enabled for {tenant.name}.
          Invitation, welcome, and password-reset emails are always sent immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-5 sm:grid-cols-2">
          <input type="hidden" name="LoggedTime" value={loggedTime} />
          <input type="hidden" name="UnclassifiedEntry" value={unclassifiedEntry} />
          <Field
            label="Hours logged"
            htmlFor="email-freq-logged-time"
            hint="When someone saves classified volunteer or staff hours."
          >
            <SelectField
              id="email-freq-logged-time"
              aria-label="Hours logged frequency"
              value={loggedTime}
              onValueChange={(value) => setLoggedTime((value || "immediate") as TimeEmailFrequency)}
              options={frequencyOptions}
            />
          </Field>
          <Field
            label="Unclassified time"
            htmlFor="email-freq-unclassified"
            hint="When a timer is stopped without a project, task category, or group."
          >
            <SelectField
              id="email-freq-unclassified"
              aria-label="Unclassified time frequency"
              value={unclassifiedEntry}
              onValueChange={(value) => setUnclassifiedEntry((value || "immediate") as TimeEmailFrequency)}
              options={frequencyOptions}
            />
          </Field>

          <div className="grid gap-3 pt-1 sm:col-span-2 sm:grid-cols-2">
            {booleanEmailItems.map((item) => (
              <label key={item.key} className="flex items-start gap-2.5 rounded-lg border p-3 text-sm">
                <Checkbox name={item.key} value="on" defaultChecked={saved[item.key]} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium leading-tight">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.description}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex items-end justify-between gap-3 sm:col-span-2">
            <FormMessage result={result} />
            <SubmitButton className="ml-auto h-9">Save email settings</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function EmailTemplatesCard() {
  const tenant = useTenant();
  const settings = tenant.preferences.emailSettings ?? defaultEmailSettings;
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
          {data.map((template) => {
            const badge = emailTemplateBadge(template.for, template.isEnabled, settings);
            return (
              <li key={template.id}>
                <Link
                  href={`/settings/email/${template.id}`}
                  className="flex items-center gap-3 px-6 py-3 text-sm transition-colors hover:bg-muted/60"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{template.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {emailForLabels[template.for]} · v{template.version} · Updated{" "}
                      {updatedFormat.format(new Date(template.updatedAt))}
                    </span>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
