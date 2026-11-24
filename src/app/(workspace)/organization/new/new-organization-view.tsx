"use client";

import { useActionState, useEffect, useState } from "react";
import { createTenantAction } from "@/app/actions/tenants";
import { Field, FormMessage } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/hooks/use-workspace";
import { labels } from "@/lib/labels";
import { EditorLayout } from "../editor-layout";

type SaveStatus = {
  result: { ok: boolean; error?: string; message?: string } | null;
  pending: boolean;
};

export function NewTenantView() {
  const { tenant } = useWorkspace();
  const copy = labels(tenant?.preferences);
  const [status, setStatus] = useState<SaveStatus>({ result: null, pending: false });

  return (
    <EditorLayout
      footer={
        <div
          role="group"
          aria-label={`New ${copy.tenant.toLowerCase()} actions`}
          className="flex flex-col gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10 sm:flex-row sm:items-center"
        >
          <div className="min-w-0 flex-1">
            <FormMessage result={status.result} />
          </div>
          <SubmitButton form="new-tenant-form" pending={status.pending} className="h-9 w-full sm:ml-auto sm:w-auto">
            Create {copy.tenant.toLowerCase()}
          </SubmitButton>
        </div>
      }
    >
      <NewTenantForm onStatus={setStatus} />
    </EditorLayout>
  );
}

function NewTenantForm({ onStatus }: { onStatus: (status: SaveStatus) => void }) {
  const { tenant } = useWorkspace();
  const copy = labels(tenant?.preferences);
  const [result, action, pending] = useActionState(createTenantAction, null);

  useEffect(() => {
    onStatus({ result, pending });
  }, [onStatus, pending, result]);

  return (
    <form id="new-tenant-form" action={action}>
      <Card>
        <CardHeader>
          <CardTitle>New {copy.tenant.toLowerCase()}</CardTitle>
          <CardDescription>You will be its first admin. Switch between tenants any time from the top bar.</CardDescription>
        </CardHeader>
        <CardContent>
          <Field label={`${copy.tenant} name`} htmlFor="name">
            <Input id="name" name="name" required maxLength={200} placeholder="Riverside Food Bank" className="h-9" autoFocus />
          </Field>
        </CardContent>
      </Card>
    </form>
  );
}
