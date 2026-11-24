"use client";

import { ExternalLinkIcon, MessageSquareIcon, MoreVerticalIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { syncFeedbackLinearAction, updateFeedbackAction } from "@/app/actions/feedback";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { EntityFormDialog } from "@/components/entity-forms/entity-form-dialog";
import { FeedbackDialog } from "@/components/entity-forms/feedback-form";
import { Field, FormMessage } from "@/components/field";
import { PageHeader } from "@/components/page-header";
import { SelectField } from "@/components/select-field";
import { PageSkeleton } from "@/components/skeletons";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useClientRedirect } from "@/hooks/use-client-redirect";
import { useWorkspace } from "@/hooks/use-workspace";
import type { FeedbackStatus } from "@/lib/api/json";
import { feedbackAreas, feedbackLabel, feedbackPriorities, feedbackStatuses, feedbackTypes } from "@/lib/feedback";
import { formatPersonName } from "@/lib/format";
import { feedbackQuery, keys, syncFeedbackInCache } from "@/lib/queries";
import type { ActionResult, Feedback } from "@/lib/types";

type SortKey = "createdAt" | "title" | "priority" | "status";
type SortDir = "asc" | "desc";

type TableFilterState = {
  search: string;
  type: string;
  priority: string;
  area: string;
  status: string;
  sortKey: SortKey;
  sortDir: SortDir;
};

const defaultTableFilterState: TableFilterState = {
  search: "",
  type: "all",
  priority: "all",
  area: "all",
  status: "all",
  sortKey: "createdAt",
  sortDir: "desc",
};

let cachedTab: "active" | "inactive" = "active";
const cachedTableFilters: Record<"active" | "inactive", TableFilterState> = {
  active: { ...defaultTableFilterState },
  inactive: { ...defaultTableFilterState },
};

function formatWhen(value: string) {
  return new Date(value).toLocaleString();
}

export function FeedbackView() {
  const { viewer } = useWorkspace();
  const [tab, setTab] = useState<"active" | "inactive">(() => cachedTab);
  useClientRedirect(!viewer.isSuperAdmin, "/dashboard");
  useQuery({ ...feedbackQuery(true), enabled: viewer.isSuperAdmin });
  useQuery({ ...feedbackQuery(false), enabled: viewer.isSuperAdmin });
  if (!viewer.isSuperAdmin) return <PageSkeleton rows={8} />;

  return (
    <>
      <PageHeader description='Bugs and feature requests from everyone who uses the app.' />
      <Tabs
        value={tab}
        onValueChange={(next) => {
          const resolved = next === "inactive" ? "inactive" : "active";
          cachedTab = resolved;
          setTab(resolved);
        }}
      >
        <TabsList variant='line'>
          <TabsTrigger value='active'>Active</TabsTrigger>
          <TabsTrigger value='inactive'>Inactive</TabsTrigger>
        </TabsList>
        <TabsContent value='active'>
          <FeedbackTable active />
        </TabsContent>
        <TabsContent value='inactive'>
          <FeedbackTable active={false} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function FeedbackTable({ active }: { active: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const bucket = active ? "active" : "inactive";
  const initial = cachedTableFilters[bucket];
  const { data, isPending } = useQuery(feedbackQuery(active));
  const [search, setSearchState] = useState(initial.search);
  const [type, setTypeState] = useState(initial.type);
  const [priority, setPriorityState] = useState(initial.priority);
  const [area, setAreaState] = useState(initial.area);
  const [status, setStatusState] = useState(initial.status);
  const [sortKey, setSortKeyState] = useState<SortKey>(initial.sortKey);
  const [sortDir, setSortDirState] = useState<SortDir>(initial.sortDir);
  const [selected, setSelected] = useState<Feedback | null>(null);
  const [creating, setCreating] = useState(false);

  const setSearch = (value: string) => {
    cachedTableFilters[bucket].search = value;
    setSearchState(value);
  };
  const setType = (value: string) => {
    cachedTableFilters[bucket].type = value;
    setTypeState(value);
  };
  const setPriority = (value: string) => {
    cachedTableFilters[bucket].priority = value;
    setPriorityState(value);
  };
  const setArea = (value: string) => {
    cachedTableFilters[bucket].area = value;
    setAreaState(value);
  };
  const setStatus = (value: string) => {
    cachedTableFilters[bucket].status = value;
    setStatusState(value);
  };

  const syncLinear = useActionMutation(syncFeedbackLinearAction, {
    invalidate: (id) => [keys.feedback(true), keys.feedback(false), keys.feedbackItem(id)],
    onSuccess: (updated) => {
      if (updated) {
        syncFeedbackInCache(queryClient, updated);
      }
    },
  });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = (data?.items ?? []).filter((row) => {
      if (type !== "all" && row.type !== type) return false;
      if (priority !== "all" && row.priority !== priority) return false;
      if (area !== "all" && row.area !== area) return false;
      if (status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      return `${row.title} ${row.description} ${formatPersonName(row.user)}`.toLowerCase().includes(needle);
    });
    const ranked = [...filtered].sort((left, right) => {
      const a = sortKey === "createdAt" ? left.createdAt : left[sortKey];
      const b = sortKey === "createdAt" ? right.createdAt : right[sortKey];
      return a.localeCompare(b) * (sortDir === "asc" ? 1 : -1);
    });
    return ranked;
  }, [area, data?.items, priority, search, sortDir, sortKey, status, type]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      const nextDir: SortDir = sortDir === "asc" ? "desc" : "asc";
      cachedTableFilters[bucket].sortDir = nextDir;
      setSortDirState(nextDir);
      return;
    }

    const nextDir: SortDir = key === "createdAt" ? "desc" : "asc";
    cachedTableFilters[bucket].sortKey = key;
    cachedTableFilters[bucket].sortDir = nextDir;
    setSortKeyState(key);
    setSortDirState(nextDir);
  }

  const columns: Column<Feedback>[] = [
    {
      key: "title",
      header: (
        <button
          type='button'
          className='uppercase'
          onClick={(event) => {
            event.stopPropagation();
            toggleSort("title");
          }}
        >
          Title
        </button>
      ),
      primary: true,
      wrap: true,
      cell: (row) => (
        <Link
          href={`/feedback/${row.id}`}
          className='font-medium underline-offset-4 hover:underline'
          onClick={(event) => event.stopPropagation()}
        >
          {row.title}
        </Link>
      ),
    },
    {
      key: "type",
      header: "Type",
      wrap: true,
      cell: (row) => feedbackLabel(feedbackTypes, row.type),
    },
    {
      key: "priority",
      header: (
        <button
          type='button'
          className='uppercase'
          onClick={(event) => {
            event.stopPropagation();
            toggleSort("priority");
          }}
        >
          Priority
        </button>
      ),
      cell: (row) => feedbackLabel(feedbackPriorities, row.priority),
    },
    {
      key: "area",
      header: "Area",
      wrap: true,
      cell: (row) => feedbackLabel(feedbackAreas, row.area),
    },
    {
      key: "status",
      header: (
        <button
          type='button'
          className='uppercase'
          onClick={(event) => {
            event.stopPropagation();
            toggleSort("status");
          }}
        >
          Status
        </button>
      ),
      wrap: true,
      cell: (row) => feedbackLabel(feedbackStatuses, row.status),
    },
    {
      key: "submitter",
      header: "From",
      wrap: true,
      cell: (row) => formatPersonName(row.user),
    },
    {
      key: "tenant",
      header: "Tenant",
      wrap: true,
      cell: (row) => row.tenant?.name ?? "—",
    },
    {
      key: "ticket",
      header: "Ticket",
      wrap: true,
      cell: (row) =>
        row.ticketUrl ? (
          <a
            href={row.ticketUrl}
            target='_blank'
            rel='noreferrer'
            className='inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline'
            onClick={(event) => event.stopPropagation()}
          >
            <span>{row.linearIssueIdentifier ? row.linearIssueIdentifier : "Open"}</span>
            <ExternalLinkIcon className='size-3 shrink-0' />
          </a>
        ) : (
          <Button
            type='button'
            size='xs'
            variant='outline'
            disabled={syncLinear.isPending && syncLinear.variables === row.id}
            onClick={(event) => {
              event.stopPropagation();
              syncLinear.mutate(row.id);
            }}
          >
            {syncLinear.isPending && syncLinear.variables === row.id ? "Creating..." : "Create in Linear"}
          </Button>
        ),
    },
    {
      key: "createdAt",
      header: (
        <button
          type='button'
          className='uppercase'
          onClick={(event) => {
            event.stopPropagation();
            toggleSort("createdAt");
          }}
        >
          Received
        </button>
      ),
      wrap: true,
      cell: (row) => formatWhen(row.createdAt),
    },
    {
      key: "actions",
      header: <span className='sr-only'>Actions</span>,
      align: "right",
      width: "3rem",
      cell: (row) => (
        <div className='flex justify-end' onClick={(event) => event.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  className='shrink-0'
                  aria-label={`Actions for ${row.title}`}
                />
              }
            >
              <MoreVerticalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => setSelected(row)}>Update</DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/feedback/${row.id}`)}>View details</DropdownMenuItem>
              {!row.ticketUrl ? (
                <DropdownMenuItem
                  disabled={syncLinear.isPending && syncLinear.variables === row.id}
                  onClick={() => syncLinear.mutate(row.id)}
                >
                  {syncLinear.isPending && syncLinear.variables === row.id ? "Creating..." : "Create in Linear"}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <div className='grid gap-4'>
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]'>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder='Search'
          aria-label='Search feedback'
          className='h-9'
        />
        <SelectField
          value={type}
          onValueChange={setType}
          options={[{ value: "all", label: "All types" }, ...feedbackTypes]}
        />
        <SelectField
          value={priority}
          onValueChange={setPriority}
          options={[{ value: "all", label: "All priorities" }, ...feedbackPriorities]}
        />
        <SelectField
          value={area}
          onValueChange={setArea}
          options={[{ value: "all", label: "All areas" }, ...feedbackAreas]}
        />
        <SelectField
          value={status}
          onValueChange={setStatus}
          options={[{ value: "all", label: "All statuses" }, ...feedbackStatuses]}
        />
        <Button type='button' className='h-9' onClick={() => setCreating(true)}>
          <PlusIcon />
          Create Feedback
        </Button>
      </div>
      {isPending ? (
        <PageSkeleton rows={8} />
      ) : rows.length ? (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/feedback/${row.id}`)}
        />
      ) : (
        <EmptyState icon={MessageSquareIcon} title='No feedback in this list' />
      )}
      <FeedbackDialog open={creating} onOpenChange={setCreating} />
      <UpdateFeedbackDialog
        feedback={selected ? (data?.items.find((item) => item.id === selected.id) ?? selected) : null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}

function UpdateFeedbackDialog({
  feedback,
  onOpenChange,
}: {
  feedback: Feedback | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <EntityFormDialog
      open={Boolean(feedback)}
      onOpenChange={onOpenChange}
      title='Update feedback'
      description={feedback?.title}
      className='sm:max-w-lg'
    >
      {feedback ? (
        <UpdateFeedbackForm
          key={`${feedback.id}:${feedback.status}:${feedback.ticketUrl ?? ""}`}
          feedback={feedback}
          onSaved={() => onOpenChange(false)}
        />
      ) : null}
    </EntityFormDialog>
  );
}

function UpdateFeedbackForm({ feedback, onSaved }: { feedback: Feedback; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<FeedbackStatus>(feedback.status);
  const update = useActionMutation(updateFeedbackAction, {
    invalidate: [keys.feedback(true), keys.feedback(false), keys.feedbackItem(feedback.id)],
    onSuccess: (updated) => {
      if (updated) {
        syncFeedbackInCache(queryClient, updated);
      }
      onSaved();
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

  return (
    <form
      className='grid gap-4'
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
      <p className='text-sm text-muted-foreground whitespace-pre-wrap'>{feedback.description}</p>
      <div className='flex items-center justify-between gap-2 text-sm'>
        {feedback.ticketUrl ? (
          <p className='text-sm'>
            Linear issue:{" "}
            <a
              href={feedback.ticketUrl}
              target='_blank'
              rel='noreferrer'
              className='inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline'
            >
              <span>{feedback.linearIssueIdentifier ? feedback.linearIssueIdentifier : feedback.ticketUrl}</span>
              <ExternalLinkIcon className='size-3 shrink-0' />
            </a>
          </p>
        ) : (
          <div className='flex items-center gap-2'>
            <span className='text-xs text-muted-foreground'>No Linear issue linked yet.</span>
            <Button
              type='button'
              size='xs'
              variant='outline'
              disabled={syncLinear.isPending}
              onClick={() => syncLinear.mutate(feedback.id)}
            >
              {syncLinear.isPending ? "Creating..." : "Create in Linear"}
            </Button>
          </div>
        )}
      </div>
      <Field label='Status' htmlFor='feedback-status'>
        <SelectField
          id='feedback-status'
          value={status}
          onValueChange={(value) => setStatus(value as FeedbackStatus)}
          options={feedbackStatuses}
        />
      </Field>
      <Field label='Note' htmlFor='feedback-note'>
        <Textarea
          id='feedback-note'
          name='description'
          required
          maxLength={2000}
          rows={4}
          placeholder='Leave a comment or status update note...'
        />
      </Field>
      <Field
        label='Ticket URL'
        htmlFor='feedback-ticket'
        hint='Optional extra ticket URL. Linear issues are created automatically.'
      >
        <Input id='feedback-ticket' name='ticketUrl' type='url' className='h-9' defaultValue={feedback.ticketUrl ?? ""} />
      </Field>
      <div className='flex items-center justify-end gap-2'>
        <FormMessage result={update.error ? ({ ok: false, error: update.error.message } satisfies ActionResult) : null} />
        <SubmitButton pending={update.isPending}>Save</SubmitButton>
      </div>
    </form>
  );
}
