"use client";

import { CopyIcon, KeyRoundIcon, MoreVerticalIcon, PlusIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { createApiKeyAction, revokeApiKeyAction, rotateApiKeyAction, updateApiKeyAction } from "@/app/actions/api-keys";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DialogActions } from "@/components/dialog-actions";
import { EntityFormDialog } from "@/components/entity-forms/entity-form-dialog";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { PageSkeleton } from "@/components/skeletons";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useApiKeys } from "@/hooks/use-api-keys";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { formatInstant } from "@/lib/format";
import { keys } from "@/lib/queries";
import type { TenantApiKey } from "@/lib/types";

const scopeOptions = [
  { value: "org:read", label: "Read", hint: "View this tenant." },
  { value: "org:write", label: "Write", hint: "Create and update records." },
  { value: "org:admin", label: "Admin", hint: "Manage people, invitations, and API keys." },
] as const;

const scopeLabels: Record<string, string> = {
  "org:read": "Read",
  "org:write": "Write",
  "org:admin": "Admin",
};

type IssuedKey = TenantApiKey & { key: string };

function dateInputValue(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

function expiresInstant(date: string) {
  return date ? `${date}T23:59:59.000Z` : null;
}

function issuedKey(value: unknown): IssuedKey | null {
  if (!value || typeof value !== "object" || !("key" in value) || typeof value.key !== "string") {
    return null;
  }

  return value as IssuedKey;
}

export function ApiKeysView() {
  const tenant = useTenant();
  const { viewer } = useWorkspace();
  const { apiKeys, isPending } = useApiKeys();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TenantApiKey | null>(null);
  const [rotating, setRotating] = useState<TenantApiKey | null>(null);
  const [revoking, setRevoking] = useState<TenantApiKey | null>(null);
  const [revealed, setRevealed] = useState<IssuedKey | null>(null);
  const invalidate = [keys.apiKeys(tenant.id)];
  const rotate = useActionMutation((keyId: string) => rotateApiKeyAction(tenant.id, keyId), {
    invalidate,
    onSuccess: (data) => {
      const issued = issuedKey(data);
      if (issued) setRevealed(issued);
      setRotating(null);
    },
  });
  const revoke = useActionMutation((keyId: string) => revokeApiKeyAction(tenant.id, keyId), {
    invalidate,
    onSuccess: () => setRevoking(null),
  });

  if (isPending) return <PageSkeleton rows={4} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>API keys</CardTitle>
        <CardDescription>
          Let another system read or change this tenant. The secret is shown only when a key is created or rotated.
        </CardDescription>
        <CardAction>
          <Button type="button" size="sm" className="h-8" onClick={() => setCreating(true)}>
            <PlusIcon />
            New key
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {apiKeys.length ? (
          <ul className="divide-y rounded-lg border">
            {apiKeys.map((apiKey) => (
              <li key={apiKey.id} className="flex items-start gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{apiKey.name}</span>
                    {apiKey.scopes.map((scope) => (
                      <Badge key={scope} variant="secondary">
                        {scopeLabels[scope] ?? scope}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{apiKey.prefix}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {formatInstant(apiKey.createdAt, viewer.timezone)}
                    {" · "}
                    {apiKey.lastUsedAt ? `Last used ${formatInstant(apiKey.lastUsedAt, viewer.timezone)}` : "Never used"}
                    {apiKey.expiresAt ? ` · Expires ${formatInstant(apiKey.expiresAt, viewer.timezone)}` : ""}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label={`Actions for ${apiKey.name}`} />
                    }
                  >
                    <MoreVerticalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditing(apiKey)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRotating(apiKey)}>Rotate</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRevoking(apiKey)}>Revoke</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={KeyRoundIcon}
            title="No API keys yet"
            description="Create a key when another system needs access to this tenant."
            className="py-8"
          />
        )}
      </CardContent>
      <EntityFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="New API key"
        description="Choose what this key is allowed to do. You will see the secret once."
      >
        <KeyForm
          onCancel={() => setCreating(false)}
          onIssued={(issued) => {
            setCreating(false);
            setRevealed(issued);
          }}
        />
      </EntityFormDialog>
      <EntityFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit API key"
        description="Changing scopes takes effect the next time the key is used."
      >
        {editing ? <KeyForm apiKey={editing} onCancel={() => setEditing(null)} /> : null}
      </EntityFormDialog>
      <SecretDialog issued={revealed} onClose={() => setRevealed(null)} />
      <ConfirmDialog
        open={rotating !== null}
        onOpenChange={(open) => !open && setRotating(null)}
        title={`Rotate ${rotating?.name ?? "this key"}?`}
        description="The current secret stops working immediately. The new secret is shown once."
        confirmLabel="Rotate"
        onConfirm={() => rotating && rotate.mutate(rotating.id)}
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke ${revoking?.name ?? "this key"}?`}
        description="This key stops working immediately and cannot be restored."
        confirmLabel="Revoke"
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </Card>
  );
}

function KeyForm({
  apiKey,
  onCancel,
  onIssued,
}: {
  apiKey?: TenantApiKey;
  onCancel: () => void;
  onIssued?: (issued: IssuedKey) => void;
}) {
  const tenant = useTenant();
  const formId = useId();
  const [name, setName] = useState(apiKey?.name ?? "");
  const [scopes, setScopes] = useState<string[]>(apiKey?.scopes ?? ["org:read"]);
  const [expiresOn, setExpiresOn] = useState(dateInputValue(apiKey?.expiresAt ?? null));
  const [scopeError, setScopeError] = useState<string | null>(null);
  const invalidate = [keys.apiKeys(tenant.id)];
  const save = useActionMutation(
    (input: { name: string; scopes: string[]; expiresAt: string | null }) =>
      apiKey
        ? updateApiKeyAction(tenant.id, apiKey.id, input)
        : createApiKeyAction(tenant.id, input),
    {
      invalidate,
      onSuccess: (data) => {
        const issued = issuedKey(data);
        if (issued) onIssued?.(issued);
        else onCancel();
      },
    },
  );

  function toggleScope(scope: string, checked: boolean) {
    setScopeError(null);
    setScopes((current) => {
      const next = checked ? [...current, scope] : current.filter((item) => item !== scope);
      return scopeOptions.map((option) => option.value).filter((value) => next.includes(value));
    });
  }

  return (
    <form
      id={`${formId}-form`}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || scopes.length === 0) {
          setScopeError(scopes.length === 0 ? "Choose at least one scope." : null);
          return;
        }

        save.mutate({ name: trimmed, scopes, expiresAt: expiresInstant(expiresOn) });
      }}
    >
      <Field label="Name" htmlFor={`${formId}-name`}>
        <Input
          id={`${formId}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={80}
          autoFocus
          className="h-9"
        />
      </Field>
      <Field label="Scopes" error={scopeError}>
        <div className="flex flex-col gap-3">
          {scopeOptions.map((option) => {
            const id = `${formId}-${option.value}`;
            return (
              <div key={option.value} className="flex items-start gap-2">
                <Checkbox
                  id={id}
                  className="mt-0.5"
                  checked={scopes.includes(option.value)}
                  onCheckedChange={(checked) => toggleScope(option.value, checked === true)}
                />
                <label htmlFor={id}>
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </label>
              </div>
            );
          })}
        </div>
      </Field>
      <Field label="Expires" htmlFor={`${formId}-expires`} hint="Leave blank if this key should not expire.">
        <Input
          id={`${formId}-expires`}
          type="date"
          value={expiresOn}
          onChange={(event) => setExpiresOn(event.target.value)}
          className="h-9"
        />
      </Field>
      <DialogActions form={`${formId}-form`}>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton pending={save.isPending}>{apiKey ? "Save" : "Create key"}</SubmitButton>
      </DialogActions>
    </form>
  );
}

function SecretDialog({ issued, onClose }: { issued: IssuedKey | null; onClose: () => void }) {
  const fieldId = useId();
  return (
    <EntityFormDialog
      open={issued !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Copy this secret"
      description="This is the only time the secret is shown. Store it somewhere safe before closing."
    >
      {issued ? (
        <div className="flex flex-col gap-4">
          <Field label={issued.name} htmlFor={fieldId}>
            <Input id={fieldId} readOnly value={issued.key} className="h-9 font-mono text-xs" />
          </Field>
          <DialogActions>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(issued.key).then(
                  () => toast.success("Secret copied."),
                  () => toast.error("Could not copy the secret."),
                );
              }}
            >
              <CopyIcon />
              Copy
            </Button>
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </DialogActions>
        </div>
      ) : null}
    </EntityFormDialog>
  );
}
