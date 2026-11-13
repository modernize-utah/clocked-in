"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  Building2Icon,
  CalendarIcon,
  ExternalLinkIcon,
  FileTextIcon,
  MessageSquareIcon,
  TagIcon,
  UserIcon,
} from "lucide-react";
import { cn } from "cn";
import { editFeedbackAction, syncFeedbackLinearAction, updateFeedbackAction } from "@/app/actions/feedback";
import { FormMessage } from "@/components/field";
import { SelectField } from "@/components/select-field";
import { PageSkeleton } from "@/components/skeletons";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useWorkspace } from "@/hooks/use-workspace";
import type { FeedbackArea, FeedbackPriority, FeedbackStatus, FeedbackType } from "@/lib/api/json";
import { HttpError } from "@/lib/fetch-json";
import {
  feedbackAreas,
  feedbackAttachmentName,
  feedbackLabel,
  feedbackOption,
  feedbackPriorities,
  feedbackStatuses,
  feedbackTypes,
  isFeedbackImageUrl,
} from "@/lib/feedback";
import { feedbackItemQuery, keys, syncFeedbackInCache } from "@/lib/queries";
import type { ActionResult, Feedback, Paged } from "@/lib/types";
import { safeHttpUrl } from "@/lib/url";
import { formatPersonName } from "@/lib/format";

function formatWhen(value: string) {
  return new Date(value).toLocaleString();
}

function loadError(error: Error) {
  if (error instanceof HttpError && error.status === 404) {
    return "This feedback was not found.";
  }

  if (error instanceof HttpError && error.status === 403) {
    return "Only the sender, an organization admin, or a super admin can open this feedback.";
  }

  return error.message;
}

export function FeedbackDetail({ id }: { id: string }) {
  const { viewer } = useWorkspace();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery(feedbackItemQuery(id));
  useEffect(() => {
    if (data) {
      syncFeedbackInCache(queryClient, data);
    }
  }, [data, queryClient]);
  const summary =
    data ??
    queryClient.getQueryData<Paged<Feedback>>(keys.feedback(true))?.items.find((item) => item.id === id) ??
    queryClient.getQueryData<Paged<Feedback>>(keys.feedback(false))?.items.find((item) => item.id === id);
  const syncLinear = useActionMutation(syncFeedbackLinearAction, {
    invalidate: [keys.feedback(true), keys.feedback(false), keys.feedbackItem(id)],
    onSuccess: (updated) => {
      if (updated) {
        syncFeedbackInCache(queryClient, updated);
      }
    },
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href="/feedback"
            className="inline-flex items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            All feedback
          </Link>
          {summary ? (
            <>
              <span className="text-muted-foreground/40">/</span>
              <span className="font-mono text-xs text-foreground">
                {summary.linearIssueIdentifier ?? `FB-${summary.id.slice(0, 6).toUpperCase()}`}
              </span>
            </>
          ) : null}
        </div>
        {summary?.ticketUrl ? (
          <a
            href={summary.ticketUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-muted"
          >
            <span>{summary.linearIssueIdentifier ? `Open ${summary.linearIssueIdentifier} in Linear` : "Open ticket"}</span>
            <ExternalLinkIcon className="size-3 text-muted-foreground" />
          </a>
        ) : viewer.isSuperAdmin && summary ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={syncLinear.isPending}
            onClick={() => syncLinear.mutate(summary.id)}
          >
            {syncLinear.isPending ? "Creating in Linear..." : "Create in Linear"}
          </Button>
        ) : null}
      </div>
      {isPending ? <PageSkeleton rows={8} /> : null}
      {error ? <p className="text-sm text-muted-foreground">{loadError(error)}</p> : null}
      {data ? (
        <FeedbackEditor
          key={`${data.id}:${data.updatedAt}:${data.status}:${data.actions.length}`}
          feedback={data}
          canUpdateStatus={viewer.isSuperAdmin}
        />
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: FeedbackStatus }) {
  const option = feedbackOption(feedbackStatuses, status);
  return (
    <Badge variant="outline" className="gap-1.5 bg-background/80 px-2.5 py-0.5 text-xs font-normal">
      {option?.swatch ? <span className={cn("size-2 shrink-0 rounded-full", option.swatch)} /> : null}
      {option?.label ?? status}
    </Badge>
  );
}

function PropertyPill({
  options,
  value,
}: {
  options: { value: string; label: string; swatch?: string }[];
  value: string;
}) {
  const option = feedbackOption(options, value);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
      {option?.swatch ? <span className={cn("size-2 shrink-0 rounded-full", option.swatch)} /> : null}
      {option?.label ?? value}
    </span>
  );
}

function FeedbackEditor({ feedback, canUpdateStatus }: { feedback: Feedback; canUpdateStatus: boolean }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(feedback.title);
  const [description, setDescription] = useState(feedback.description);
  const [type, setType] = useState(feedback.type);
  const [priority, setPriority] = useState(feedback.priority);
  const [area, setArea] = useState(feedback.area);

  const edit = useActionMutation(editFeedbackAction, {
    invalidate: [keys.feedback(true), keys.feedback(false), keys.feedbackItem(feedback.id)],
    onSuccess: (updated) => {
      if (updated) {
        syncFeedbackInCache(queryClient, updated);
      }
    },
    errorToast: false,
  });
  const syncLinear = useActionMutation(syncFeedbackLinearAction, {
    invalidate: [keys.feedback(true), keys.feedback(false), keys.feedbackItem(feedback.id)],
    onSuccess: (updated) => {
      if (updated) {
        syncFeedbackInCache(queryClient, updated);
      }
    },
  });

  const screenshots = feedback.screenshotUrls
    .map((url) => safeHttpUrl(url))
    .filter((url): url is string => Boolean(url));

  const isDirty =
    title !== feedback.title ||
    description !== feedback.description ||
    type !== feedback.type ||
    priority !== feedback.priority ||
    area !== feedback.area;

  function saveIssue(next?: {
    type?: string;
    priority?: string;
    area?: string;
    title?: string;
    description?: string;
  }) {
    const resolvedTitle = (next?.title ?? title).trim();
    const resolvedDescription = (next?.description ?? description).trim();
    if (!resolvedTitle || !resolvedDescription) {
      return;
    }

    edit.mutate({
      id: feedback.id,
      type: next?.type ?? type,
      priority: next?.priority ?? priority,
      area: next?.area ?? area,
      title: resolvedTitle,
      description: resolvedDescription,
    });
  }

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="grid lg:grid-cols-[1fr_290px]">
        {/* Left Main Editor Column */}
        <div className="flex min-w-0 flex-col gap-6 p-5 sm:p-8">
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              saveIssue();
            }}
          >
            {/* Header row: Identifier + Status badge + quick property chips */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-medium text-muted-foreground">
                  {feedback.linearIssueIdentifier ?? "ISSUE"}
                </span>
                <StatusPill status={feedback.status} />
                <Badge variant="secondary" className="gap-1.5 font-normal">
                  <PropertyPill options={feedbackTypes} value={type} />
                </Badge>
                <Badge variant="secondary" className="gap-1.5 font-normal">
                  <PropertyPill options={feedbackPriorities} value={priority} />
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {feedbackLabel(feedbackStatuses, feedback.status as FeedbackStatus)} · {formatWhen(feedback.createdAt)}
              </span>
            </div>

            {/* Inline Issue Title */}
            <div className="grid gap-1.5">
              <h2 className="sr-only">{feedback.title}</h2>
              <Label htmlFor="edit-title" className="sr-only">
                Title
              </Label>
              <Input
                id="edit-title"
                name="title"
                required
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Issue title"
                className="h-auto border-transparent bg-transparent px-2 py-1.5 text-xl font-semibold tracking-tight shadow-none hover:bg-muted/50 focus-visible:border-ring focus-visible:bg-background md:text-2xl dark:bg-transparent"
              />
            </div>

            {/* Inline Issue Description */}
            <div className="grid gap-1.5">
              <p className="sr-only">{feedback.description}</p>
              <Label htmlFor="edit-description" className="sr-only">
                Description
              </Label>
              <Textarea
                id="edit-description"
                name="description"
                required
                maxLength={4000}
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add description..."
                className="min-h-32 resize-y border-transparent bg-transparent px-2 py-1.5 text-sm leading-6 shadow-none hover:bg-muted/40 focus-visible:border-ring focus-visible:bg-background dark:bg-transparent"
              />
            </div>

            {/* Save bar — always accessible, highlighted when dirty */}
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 border-t pt-3 transition-opacity",
                isDirty || edit.isPending || edit.error ? "opacity-100" : "opacity-80",
              )}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {isDirty ? (
                  <span>Unsaved changes</span>
                ) : (
                  <span>Updated {formatWhen(feedback.updatedAt)}</span>
                )}
                <FormMessage
                  result={edit.error ? ({ ok: false, error: edit.error.message } satisfies ActionResult) : null}
                />
              </div>
              <div className="flex items-center gap-2">
                {isDirty ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTitle(feedback.title);
                      setDescription(feedback.description);
                      setType(feedback.type);
                      setPriority(feedback.priority);
                      setArea(feedback.area);
                    }}
                  >
                    Discard
                  </Button>
                ) : null}
                <SubmitButton size="sm" pending={edit.isPending}>
                  Save feedback
                </SubmitButton>
              </div>
            </div>
          </form>

          {/* Attachments / Screenshots */}
          {screenshots.length ? (
            <div className="grid gap-3 border-t pt-5">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Attachments ({screenshots.length})
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {screenshots.map((url, index) =>
                  isFeedbackImageUrl(url) ? (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative block overflow-hidden rounded-lg bg-muted/30 ring-1 ring-foreground/10 transition hover:ring-foreground/25"
                    >
                      <img
                        src={url}
                        alt={`Screenshot ${index + 1}`}
                        className="max-h-72 w-full object-contain p-2"
                      />
                    </a>
                  ) : (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3.5 py-3 text-sm ring-1 ring-foreground/10 transition hover:bg-muted/50 hover:ring-foreground/25"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium text-foreground">
                          {feedbackAttachmentName(url, index)}
                        </span>
                      </span>
                      <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                    </a>
                  ),
                )}
              </div>
            </div>
          ) : null}

          {/* Activity & Triage Stream */}
          <div className="grid gap-5 border-t pt-6">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <MessageSquareIcon className="size-3.5" />
                Activity
              </h3>
              <span className="text-xs text-muted-foreground">
                {feedback.actions.length} {feedback.actions.length === 1 ? "update" : "updates"}
              </span>
            </div>

            <ActionTimeline feedback={feedback} />

            {canUpdateStatus ? <StatusComposer feedback={feedback} /> : null}
          </div>
        </div>

        {/* Right Properties Sidebar (Linear style) */}
        <aside className="flex flex-col gap-5 border-t bg-muted/20 p-5 lg:border-t-0 lg:border-l">
          <div className="grid gap-3">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Properties</h3>

            {!canUpdateStatus ? (
              <PropertyRow label="Status">
                <StatusPill status={feedback.status} />
              </PropertyRow>
            ) : null}

            <PropertyRow label="Priority" htmlFor="edit-priority">
              <SelectField
                id="edit-priority"
                size="sm"
                value={priority}
                onValueChange={(value) => {
                  const next = value as FeedbackPriority;
                  setPriority(next);
                  saveIssue({ priority: next });
                }}
                options={feedbackPriorities}
                className="border-transparent bg-transparent hover:bg-muted/70 dark:bg-transparent"
              />
            </PropertyRow>

            <PropertyRow label="Type" htmlFor="edit-type">
              <SelectField
                id="edit-type"
                size="sm"
                value={type}
                onValueChange={(value) => {
                  const next = value as FeedbackType;
                  setType(next);
                  saveIssue({ type: next });
                }}
                options={feedbackTypes}
                className="border-transparent bg-transparent hover:bg-muted/70 dark:bg-transparent"
              />
            </PropertyRow>

            <PropertyRow label="Area" htmlFor="edit-area">
              <SelectField
                id="edit-area"
                size="sm"
                value={area}
                onValueChange={(value) => {
                  const next = value as FeedbackArea;
                  setArea(next);
                  saveIssue({ area: next });
                }}
                options={feedbackAreas}
                className="border-transparent bg-transparent hover:bg-muted/70 dark:bg-transparent"
              />
            </PropertyRow>
          </div>

          <Separator />

          <dl className="grid gap-3 text-xs">
            <MetaRow icon={UserIcon} label="From">
              <span className="font-medium text-foreground">
                {formatPersonName(feedback.user)} ({feedback.user.username})
              </span>
            </MetaRow>
            <MetaRow icon={Building2Icon} label="Organization">
              <span className="text-foreground">{feedback.organization?.name ?? "—"}</span>
            </MetaRow>
            <MetaRow icon={TagIcon} label="Linear">
              {feedback.ticketUrl ? (
                <a
                  href={feedback.ticketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                >
                  {feedback.linearIssueIdentifier ? feedback.linearIssueIdentifier : "Open issue"}
                  <ExternalLinkIcon className="size-3" />
                </a>
              ) : canUpdateStatus ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={syncLinear.isPending}
                  onClick={() => syncLinear.mutate(feedback.id)}
                >
                  {syncLinear.isPending ? "Creating..." : "Create in Linear"}
                </Button>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </MetaRow>
            <MetaRow icon={CalendarIcon} label="Created">
              <span className="text-muted-foreground">{formatWhen(feedback.createdAt)}</span>
            </MetaRow>
          </dl>
        </aside>
      </div>
    </div>
  );
}

function PropertyRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2">
      <Label htmlFor={htmlFor} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-start gap-2">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <span>{label}</span>
      </dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function StatusComposer({ feedback }: { feedback: Feedback }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<FeedbackStatus>(feedback.status);
  const [showTicketInput, setShowTicketInput] = useState(Boolean(feedback.ticketUrl && !feedback.linearIssueIdentifier));
  const update = useActionMutation(updateFeedbackAction, {
    invalidate: [keys.feedback(true), keys.feedback(false), keys.feedbackItem(feedback.id)],
    onSuccess: (updated) => {
      if (updated) {
        syncFeedbackInCache(queryClient, updated);
      }
    },
    errorToast: false,
  });

  return (
    <form
      className="grid gap-3 rounded-xl bg-muted/25 p-4 ring-1 ring-foreground/10"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        update.mutate({
          id: feedback.id,
          status,
          description: String(form.get("description") ?? ""),
          ticketUrl: String(form.get("ticketUrl") ?? "").trim() || undefined,
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="feedback-status" className="text-xs font-medium text-muted-foreground">
            Status
          </Label>
          <SelectField
            id="feedback-status"
            size="sm"
            value={status}
            onValueChange={(value) => setStatus(value as FeedbackStatus)}
            options={feedbackStatuses}
            className="w-44 bg-background"
          />
        </div>
        {!feedback.ticketUrl ? (
          <button
            type="button"
            onClick={() => setShowTicketInput((prev) => !prev)}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {showTicketInput ? "Hide ticket URL" : "+ Link external ticket"}
          </button>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="feedback-note" className="sr-only">
          Note
        </Label>
        <Textarea
          id="feedback-note"
          name="description"
          required
          maxLength={2000}
          rows={3}
          placeholder="Leave a comment or status update note..."
          className="bg-background text-sm"
        />
      </div>

      {showTicketInput ? (
        <div className="grid gap-1">
          <Label htmlFor="feedback-ticket" className="text-xs text-muted-foreground">
            Ticket URL
          </Label>
          <Input
            id="feedback-ticket"
            name="ticketUrl"
            type="url"
            placeholder="https://linear.app/..."
            className="h-8 bg-background text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Optional extra ticket URL. Linear issues are created automatically.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <FormMessage
          result={update.error ? ({ ok: false, error: update.error.message } satisfies ActionResult) : null}
        />
        <SubmitButton size="sm" pending={update.isPending} className="ml-auto">
          Save status
        </SubmitButton>
      </div>
    </form>
  );
}

function ActionTimeline({ feedback }: { feedback: Feedback }) {
  return (
    <ol className="relative ml-2 grid gap-4 border-l border-border pl-5">
      <li className="relative text-xs text-muted-foreground">
        <span className="absolute -left-[25px] top-1 size-2 rounded-full bg-muted-foreground/40 ring-4 ring-card" />
        <span>
          <strong className="font-medium text-foreground">{formatPersonName(feedback.user)}</strong> created this issue ·{" "}
          {formatWhen(feedback.createdAt)}
        </span>
      </li>
      {feedback.actions.map((action) => {
        const isComment = action.previousStatus === action.updatedStatus;
        const statusOption = feedbackOption(feedbackStatuses, action.updatedStatus as FeedbackStatus);
        const actor = action.takenBy ? action.takenBy.displayName || action.takenBy.username : "Linear";
        return (
          <li key={action.id} className="relative grid gap-1.5 text-sm">
            <span
              className={cn(
                "absolute -left-[25px] top-1.5 size-2 rounded-full ring-4 ring-card",
                statusOption?.swatch ?? "bg-primary",
              )}
            />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
              <span className="font-medium text-foreground">{actor}</span>
              <span className="font-medium text-muted-foreground">
                {isComment
                  ? `Comment (${feedbackLabel(feedbackStatuses, action.updatedStatus as FeedbackStatus)})`
                  : `${feedbackLabel(feedbackStatuses, action.previousStatus as FeedbackStatus)} to ${feedbackLabel(feedbackStatuses, action.updatedStatus as FeedbackStatus)}`}
              </span>
              <span className="text-muted-foreground">· {formatWhen(action.updatedAt)}</span>
            </div>
            {action.description ? (
              <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap leading-6 ring-1 ring-foreground/5">
                {action.description}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
