"use client";

import { useActionState, useEffect, useState } from "react";
import { updateTenantDetailsAction } from "@/app/actions/tenants";
import { Field, FormMessage } from "@/components/field";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MarkdownView } from "@/components/markdown-view";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLabels } from "@/hooks/use-labels";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { websiteHref } from "@/lib/url";
import { EditorLayout } from "./editor-layout";

type SaveStatus = {
  result: { ok: boolean; error?: string; message?: string } | null;
  pending: boolean;
};

export function TenantView() {
  const tenant = useTenant();
  const { isAdmin } = useWorkspace();
  const copy = useLabels();
  const [status, setStatus] = useState<SaveStatus>({ result: null, pending: false });
  const externalGroups = tenant.preferences.portalDirectorySync === true;
  const canEdit = isAdmin && !externalGroups;

  return (
    <EditorLayout
      footer={
        canEdit ? (
          <div
            role="group"
            aria-label={`${copy.tenant} actions`}
            className="flex flex-col gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10 sm:flex-row sm:items-center"
          >
            <SaveBar result={status.result}>
              <SubmitButton form="tenant-form" pending={status.pending} className="h-9 w-full sm:ml-auto sm:w-auto">
                Save {copy.tenant.toLowerCase()}
              </SubmitButton>
            </SaveBar>
          </div>
        ) : null
      }
    >
      <TenantFields key={tenant.id} editable={canEdit} onStatus={setStatus} />
    </EditorLayout>
  );
}

function SaveBar({
  result,
  children,
}: {
  result: { ok: boolean; error?: string; message?: string } | null;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <FormMessage result={result} />
      </div>
      {children}
    </>
  );
}

function TenantFields({ editable, onStatus }: { editable: boolean; onStatus: (status: SaveStatus) => void }) {
  const tenant = useTenant();
  const copy = useLabels();
  const [result, action, pending] = useActionState(updateTenantDetailsAction.bind(null, tenant.id), null);
  const website = tenant.websiteUrl ? websiteHref(tenant.websiteUrl) : null;
  const externalGroups = tenant.preferences.portalDirectorySync === true;

  useEffect(() => {
    onStatus({ result, pending });
  }, [onStatus, pending, result]);

  const fields = (
    <Card>
      <CardHeader>
        <CardTitle>{copy.tenant}</CardTitle>
        <CardDescription>
          {externalGroups
            ? "Tenant details are managed by an external system of record."
            : editable
              ? "Name, website, and description shown on the home page."
              : "Name, website, and description shown on the home page. An tenant admin can change these."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            name={editable ? "name" : undefined}
            required={editable}
            readOnly={!editable}
            maxLength={200}
            defaultValue={tenant.name}
            className="h-9"
          />
        </Field>
        <Field label="Website" htmlFor="websiteUrl" hint={editable ? "Leave blank to remove the link." : undefined}>
          {editable ? (
            <Input
              id="websiteUrl"
              name="websiteUrl"
              type="url"
              inputMode="url"
              maxLength={2000}
              defaultValue={tenant.websiteUrl ?? ""}
              placeholder="https://"
              className="h-9"
            />
          ) : website ? (
            <a
              id="websiteUrl"
              href={website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center text-sm text-primary underline-offset-2 hover:underline"
            >
              {tenant.websiteUrl}
            </a>
          ) : (
            <p id="websiteUrl" className="flex h-9 items-center text-sm text-muted-foreground">
              No website
            </p>
          )}
        </Field>
        <Field label="Description" htmlFor="description" hint={editable ? "Shown on the home page." : undefined}>
          {editable ? (
            <MarkdownEditor
              id="description"
              name="description"
              label="Description"
              maxLength={8000}
              defaultValue={tenant.description ?? ""}
            />
          ) : tenant.description?.trim() ? (
            <MarkdownView source={tenant.description} />
          ) : (
            <p id="description" className="text-sm text-muted-foreground">
              No description yet.
            </p>
          )}
        </Field>
      </CardContent>
    </Card>
  );

  if (!editable) return fields;

  return (
    <form id="tenant-form" action={action}>
      {fields}
    </form>
  );
}
