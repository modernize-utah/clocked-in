"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { FileTextIcon, ImageIcon, XIcon } from "lucide-react";
import { createFeedbackAction } from "@/app/actions/feedback";
import { DialogActions } from "@/components/dialog-actions";
import { EntityFormDialog } from "@/components/entity-forms/entity-form-dialog";
import { Field, FormMessage } from "@/components/field";
import { SelectField } from "@/components/select-field";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  classifyFeedbackAttachment,
  feedbackAreaForPath,
  feedbackAreas,
  feedbackAttachmentAccept,
  feedbackPriorities,
  feedbackTypes,
  maxFeedbackAttachments,
} from "@/lib/feedback";
import { keys, syncFeedbackInCache } from "@/lib/queries";
import type { ActionResult } from "@/lib/types";

type PendingAttachment = {
  id: string;
  file: File;
  kind: "image" | "document";
  previewUrl: string | null;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractPastedFiles(clipboardData: DataTransfer | null, startIndex: number): File[] {
  if (!clipboardData) return [];

  const rawFiles: File[] = [];
  if (clipboardData.items && clipboardData.items.length > 0) {
    for (const item of Array.from(clipboardData.items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) rawFiles.push(file);
      }
    }
  } else if (clipboardData.files && clipboardData.files.length > 0) {
    rawFiles.push(...Array.from(clipboardData.files));
  }

  return rawFiles.map((file, idx) => {
    const trimmedName = file.name.trim();
    const isGenericClipboardName = !trimmedName || /^image(\.[a-z0-9]+)?$/i.test(trimmedName);
    if (!isGenericClipboardName) {
      return file;
    }
    const ext = file.type === "image/jpeg" ? ".jpg" : file.type === "image/webp" ? ".webp" : file.type === "image/gif" ? ".gif" : ".png";
    return new File([file], `pasted-image-${startIndex + idx + 1}${ext}`, {
      type: file.type || "image/png",
      lastModified: file.lastModified || Date.now(),
    });
  });
}

export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const idPrefix = useId();
  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Send feedback"
      description="Tell us about a bug or a feature that would help you."
      className="sm:max-w-lg"
    >
      <FeedbackForm idPrefix={idPrefix} onCreated={() => onOpenChange(false)} onCancel={() => onOpenChange(false)} />
    </EntityFormDialog>
  );
}

function FeedbackForm({
  idPrefix,
  onCreated,
  onCancel,
}: {
  idPrefix: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [type, setType] = useState("Bug");
  const [priority, setPriority] = useState("Medium");
  const [area, setArea] = useState<string>(() => feedbackAreaForPath(pathname));
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const attachmentsRef = useRef<PendingAttachment[]>([]);
  const pasteCounterRef = useRef(0);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      for (const item of attachmentsRef.current) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
    };
  }, []);

  function addFiles(incoming: File[]) {
    if (incoming.length === 0) return;

    const nextItems: PendingAttachment[] = [];
    let nextError: string | null = null;
    const availableSlots = maxFeedbackAttachments - attachments.length;

    if (availableSlots <= 0) {
      setAttachmentError(`You can attach up to ${maxFeedbackAttachments} files.`);
      return;
    }

    for (const file of incoming) {
      if (nextItems.length >= availableSlots) {
        nextError = `You can attach up to ${maxFeedbackAttachments} files.`;
        break;
      }
      const classified = classifyFeedbackAttachment(file);
      if ("error" in classified) {
        nextError = classified.error;
        continue;
      }
      const previewUrl = classified.kind === "image" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
      nextItems.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        kind: classified.kind,
        previewUrl,
      });
    }

    setAttachmentError(nextError);
    if (nextItems.length > 0) {
      setAttachments((prev) => [...prev, ...nextItems]);
    }
  }

  function removeAttachment(id: string) {
    setAttachmentError(null);
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  }

  const create = useActionMutation((formData: FormData) => createFeedbackAction(formData), {
    invalidate: [keys.feedback()],
    onSuccess: (created) => {
      if (created) {
        syncFeedbackInCache(queryClient, created);
      }
      onCreated();
    },
    errorToast: false,
  });

  const formId = `${idPrefix}-form`;

  return (
    <form
      id={formId}
      className="grid gap-4"
      onPaste={(event) => {
        const pasted = extractPastedFiles(event.clipboardData, pasteCounterRef.current);
        if (pasted.length > 0) {
          event.preventDefault();
          pasteCounterRef.current += pasted.length;
          addFiles(pasted);
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        if (attachments.length > 0) {
          formData.delete("screenshots");
          for (const item of attachments) {
            formData.append("screenshots", item.file);
          }
        }
        create.mutate(formData);
      }}
    >
      {organization ? <input type="hidden" name="organizationId" value={organization.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor={`${idPrefix}-type`}>
          <SelectField
            id={`${idPrefix}-type`}
            value={type}
            onValueChange={setType}
            options={feedbackTypes}
          />
        </Field>
        <input type="hidden" name="type" value={type} />
        <Field label="Priority" htmlFor={`${idPrefix}-priority`}>
          <SelectField
            id={`${idPrefix}-priority`}
            value={priority}
            onValueChange={setPriority}
            options={feedbackPriorities}
          />
        </Field>
        <input type="hidden" name="priority" value={priority} />
        <Field label="Area" htmlFor={`${idPrefix}-area`} className="sm:col-span-2">
          <SelectField id={`${idPrefix}-area`} value={area} onValueChange={setArea} options={feedbackAreas} />
        </Field>
        <input type="hidden" name="area" value={area} />
      </div>
      <Field label="Title" htmlFor={`${idPrefix}-title`}>
        <Input id={`${idPrefix}-title`} name="title" required maxLength={120} autoFocus className="h-9" />
      </Field>
      <Field label="Description" htmlFor={`${idPrefix}-description`}>
        <Textarea id={`${idPrefix}-description`} name="description" required maxLength={4000} rows={5} />
      </Field>
      <Field
        label="Screenshots & documents"
        htmlFor={`${idPrefix}-screenshots`}
        hint="Optional. Paste an image or upload up to 5 images or documents, 4 MB each."
        error={attachmentError ?? undefined}
      >
        <div
          className="grid gap-2"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const dropped = Array.from(event.dataTransfer.files ?? []);
            if (dropped.length > 0) {
              addFiles(dropped);
            }
          }}
        >
          <Input
            id={`${idPrefix}-screenshots`}
            name="screenshots"
            type="file"
            accept={feedbackAttachmentAccept}
            multiple
            className="h-9"
            onChange={(event) => {
              const selected = Array.from(event.currentTarget.files ?? []);
              if (selected.length > 0) {
                addFiles(selected);
                event.currentTarget.value = "";
              }
            }}
          />
          {attachments.length > 0 ? (
            <ul className="grid gap-1.5" aria-label="Attached files">
              {attachments.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt=""
                        className="size-6 shrink-0 rounded object-cover ring-1 ring-foreground/10"
                      />
                    ) : item.kind === "image" ? (
                      <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate font-medium text-foreground">{item.file.name}</span>
                    <span className="shrink-0 text-muted-foreground">({formatFileSize(item.file.size)})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(item.id)}
                    aria-label={`Remove ${item.file.name}`}
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Field>
      <FormMessage result={create.error ? ({ ok: false, error: create.error.message } satisfies ActionResult) : create.isSuccess ? { ok: true } : null} />
      <DialogActions form={formId}>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton pending={create.isPending}>Send feedback</SubmitButton>
      </DialogActions>
    </form>
  );
}

