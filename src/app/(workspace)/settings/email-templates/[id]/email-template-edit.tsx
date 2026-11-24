"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, BracesIcon, MailIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { resetEmailTemplateAction, updateEmailTemplateAction } from "@/app/actions/email-templates";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmailTemplateEditor, type EmailTemplateEditorHandle } from "@/components/email-template-editor";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { PageSkeleton } from "@/components/skeletons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useTenant } from "@/hooks/use-workspace";
import type { EmailTemplateJson } from "@/lib/api/features/email-templates";
import { emailForLabels, emailTemplateFields, previewEmail } from "@/lib/email/templates";
import { emailTemplateQuery, keys } from "@/lib/queries";

type Draft = Pick<EmailTemplateJson, "name" | "subject" | "heading" | "preview" | "template" | "isEnabled">;
type TextField = "subject" | "heading" | "preview";

function draftOf(template: EmailTemplateJson): Draft {
  return {
    name: template.name,
    subject: template.subject,
    heading: template.heading,
    preview: template.preview,
    template: template.template,
    isEnabled: template.isEnabled,
  };
}

export function EmailTemplateEdit({ templateId }: { templateId: string }) {
  const tenant = useTenant();
  const { data, isPending, isError } = useQuery(emailTemplateQuery(tenant.id, templateId));
  if (isPending) return <PageSkeleton rows={8} />;
  if (isError || !data) {
    return (
      <EmptyState
        icon={MailIcon}
        title="That email template is not available"
        action={
          <Link href="/settings/email" className={buttonVariants({ variant: "outline" })}>
            Back to email settings
          </Link>
        }
      />
    );
  }
  return <TemplateForm key={`${data.id}:${data.version}`} template={data} />;
}

function TemplateForm({ template }: { template: EmailTemplateJson }) {
  const tenant = useTenant();
  const router = useRouter();
  const queryClient = useQueryClient();
  const saved = useMemo(() => draftOf(template), [template]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [target, setTarget] = useState<TextField | "body">("body");
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const editorRef = useRef<EmailTemplateEditorHandle>(null);
  const inputs = useRef<Partial<Record<TextField, HTMLInputElement | null>>>({});
  const dirty = (Object.keys(saved) as (keyof Draft)[]).some((key) => draft[key] !== saved[key]);
  const fields = Object.keys(emailTemplateFields[template.for]);
  const preview = useMemo(() => previewEmail(draft, template.for), [draft, template.for]);
  const invalidate = [keys.emailTemplates(tenant.id), keys.emailTemplate(tenant.id, template.id)];
  const onSaved = (next: EmailTemplateJson | undefined) => {
    if (next) queryClient.setQueryData(keys.emailTemplate(tenant.id, template.id), next);
  };
  const save = useActionMutation((input: Partial<Draft>) => updateEmailTemplateAction(tenant.id, template.id, input), {
    invalidate,
    onSuccess: onSaved,
  });
  const reset = useActionMutation(() => resetEmailTemplateAction(tenant.id, template.id), {
    invalidate,
    onSuccess: onSaved,
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  function insertField(path: string) {
    const token = `{{${path}}}`;
    if (target === "body") {
      editorRef.current?.insertField(path);
      return;
    }
    const input = inputs.current[target];
    const value = draft[target];
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    set(target, `${value.slice(0, start)}${token}${value.slice(end)}`);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const changes: Partial<Draft> = {};
    for (const key of Object.keys(saved) as (keyof Draft)[]) {
      if (draft[key] !== saved[key]) (changes as Record<string, unknown>)[key] = draft[key];
    }
    if (Object.keys(changes).length > 0) save.mutate(changes);
  }

  const textInput = (key: TextField, label: string, hint?: string) => (
    <Field label={label} htmlFor={`email-${key}`} hint={hint}>
      <Input
        id={`email-${key}`}
        ref={(element) => {
          inputs.current[key] = element;
        }}
        value={draft[key]}
        onFocus={() => setTarget(key)}
        onChange={(event) => set(key, event.target.value)}
      />
    </Field>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/settings/email"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          onClick={(event) => {
            if (!dirty) return;
            event.preventDefault();
            setConfirmLeave(true);
          }}
        >
          <ArrowLeftIcon />
          Email settings
        </Link>
        <span className="text-xs text-muted-foreground">
          {emailForLabels[template.for]} · v{template.version}
        </span>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{template.name}</CardTitle>
            <CardDescription>
              {template.for === "PasswordReset"
                ? "Changes here apply only when the person resetting belongs to this one tenant. Everyone else gets the default."
                : "Fields in braces are filled in when the email is sent."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={submit}>
              <Field label="Name" htmlFor="email-name">
                <Input id="email-name" value={draft.name} onChange={(event) => set("name", event.target.value)} />
              </Field>
              {textInput("subject", "Subject")}
              {textInput("heading", "Heading", "The title in the navy header.")}
              {textInput("preview", "Preview text", "Shown next to the subject in most inboxes.")}
              <Field
                label="Body"
                htmlFor="email-body"
                action={
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" className="h-6 px-2" />}>
                      <BracesIcon />
                      Insert field
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {fields.map((path) => (
                        <DropdownMenuItem key={path} onClick={() => insertField(path)}>
                          <span className="font-mono text-xs">{`{{${path}}}`}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
                hint={`Insert field goes into the ${target === "body" ? "body" : target} at the cursor.`}
              >
                <EmailTemplateEditor
                  ref={editorRef}
                  id="email-body"
                  label="Body"
                  value={saved.template}
                  onFocus={() => setTarget("body")}
                  onChange={(html) => set("template", html)}
                />
              </Field>
              {template.isOptional ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={draft.isEnabled} onCheckedChange={(checked) => set("isEnabled", checked === true)} />
                  Send this email
                </label>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" disabled={reset.isPending} onClick={() => setConfirmReset(true)}>
                  Reset to default
                </Button>
                <Button type="submit" disabled={!dirty || save.isPending}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <Card className="xl:sticky xl:top-4 xl:self-start">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription className="truncate">Subject: {preview.subject}</CardDescription>
          </CardHeader>
          <CardContent>
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={preview.html}
              className="h-[36rem] w-full rounded-lg border bg-muted"
            />
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset to default?"
        description="This replaces the name, subject, heading, preview, and body with the original copy."
        confirmLabel="Reset"
        onConfirm={() => reset.mutate(undefined)}
      />
      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="Leave without saving?"
        description="Your changes to this email will be lost."
        confirmLabel="Leave"
        onConfirm={() => router.push("/settings/email")}
      />
    </div>
  );
}
