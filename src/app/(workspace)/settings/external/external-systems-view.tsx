"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import {
  pullPortalDirectoryAction,
  updateExternalSyncSettingsAction,
  validatePortalDirectoryAction,
} from "@/app/actions/external-sync";
import { CronInput } from "@/components/cron-input";
import { Field, FormMessage } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useTenant } from "@/hooks/use-workspace";
import { formatInstant } from "@/lib/format";

export function ExternalSystemsView() {
  const tenant = useTenant();
  const prefs = tenant.preferences;
  const portal = tenant.portal ?? {
    clientId: null,
    clientSecretSet: false,
    apiTokenSet: false,
    webhookSecretSet: false,
    lastPulledAt: null,
  };
  const [cron, setCron] = useState(prefs.portalDirectoryCron);
  const [origin, setOrigin] = useState(prefs.portalOrigin ?? "");
  const [clientId, setClientId] = useState(portal.clientId ?? "");
  const [result, action] = useActionState(updateExternalSyncSettingsAction.bind(null, tenant.id), null);

  const validate = useActionMutation(() => validatePortalDirectoryAction(tenant.id), {
    onSuccess: (data) => {
      if (data && typeof data === "object" && "ok" in data && data.ok) {
        toast.success("Portal directory is reachable.");
      }
    },
  });
  const pull = useActionMutation(() => pullPortalDirectoryAction(tenant.id), {
    onSuccess: () => toast.success("Portal directory pulled."),
  });

  return (
    <form action={action} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>CASWJ Portal</CardTitle>
          <CardDescription>
            Sign people in with the portal and sync the published directory. Register this app under
            Services in the portal, then paste the client and tokens here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Portal origin" htmlFor="portalOrigin">
            <Input
              id="portalOrigin"
              name="portalOrigin"
              type="url"
              placeholder="https://portal.wjarts.org"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            />
          </Field>
          <Field label="Client ID" htmlFor="portalClientId">
            <Input
              id="portalClientId"
              name="portalClientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="c…"
              autoComplete="off"
            />
          </Field>
          <Field label="Client secret" htmlFor="portalClientSecret">
            <Input
              id="portalClientSecret"
              name="portalClientSecret"
              type="password"
              placeholder={portal.clientSecretSet ? "•••••••• (leave blank to keep)" : "caswj_cs_…"}
              autoComplete="new-password"
            />
          </Field>
          <Field label="API token" htmlFor="portalApiToken">
            <Input
              id="portalApiToken"
              name="portalApiToken"
              type="password"
              placeholder={portal.apiTokenSet ? "•••••••• (leave blank to keep)" : "caswj_at_…"}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Webhook signing secret" htmlFor="portalWebhookSecret">
            <Input
              id="portalWebhookSecret"
              name="portalWebhookSecret"
              type="password"
              placeholder={portal.webhookSecretSet ? "•••••••• (leave blank to keep)" : "caswj_wh_…"}
              autoComplete="new-password"
            />
          </Field>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="portalSignIn" value="on" defaultChecked={prefs.portalSignIn} />
              Use portal for sign-in
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="portalDirectorySync" value="on" defaultChecked={prefs.portalDirectorySync} />
              Sync directory (people, organizations, roles, memberships, positions)
            </label>
          </div>
          <Field label="Directory sync cron" htmlFor="portalDirectoryCron">
            <CronInput
              id="portalDirectoryCron"
              name="portalDirectoryCron"
              value={cron}
              onChange={setCron}
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            Webhook URL:{" "}
            <code className="text-xs">
              {typeof window !== "undefined" ? window.location.origin : ""}/webhooks/tenants/{tenant.id}/portal
            </code>
          </p>
          <p className="text-sm text-muted-foreground">
            Last pulled: {portal.lastPulledAt ? formatInstant(portal.lastPulledAt) : "Never"}
          </p>
          <FormMessage result={result} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton>Save</SubmitButton>
            <Button type="button" variant="outline" onClick={() => validate.mutate()} disabled={validate.isPending}>
              Validate
            </Button>
            <Button type="button" variant="outline" onClick={() => pull.mutate()} disabled={pull.isPending}>
              Pull now
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
