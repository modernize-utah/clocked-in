"use client";

import { PencilIcon, PlusIcon, Trash2Icon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { deleteLookupAction, deleteLookupsAction, type NamedLookupKind } from "@/app/actions/lookups";
import { NamedEntityDialog } from "@/components/entity-forms/name-entity-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useTenant } from "@/hooks/use-workspace";
import { keys } from "@/lib/queries";

type Item = { id: string; name?: string; title?: string };

export function LookupListCard({
  kind,
  title,
  description,
  items,
  icon: Icon,
  readOnly,
  onPull,
  pullPending,
}: {
  kind: NamedLookupKind;
  title: string;
  description: string;
  items: Item[];
  icon: LucideIcon;
  readOnly?: boolean;
  onPull?: () => void;
  pullPending?: boolean;
}) {
  const tenant = useTenant();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const itemIds = new Set(items.map((item) => item.id));
  const activeSelected = selected.filter((id) => itemIds.has(id));
  const allSelected = items.length > 0 && activeSelected.length === items.length;

  const remove = useActionMutation((id: string) => deleteLookupAction(kind, id), {
    invalidate: [keys.lookups(tenant.id)],
    onSuccess: (_data, id) => {
      setSelected((current) => current.filter((itemId) => itemId !== id));
    },
  });

  const bulkRemove = useActionMutation((ids: string[]) => deleteLookupsAction(kind, ids), {
    invalidate: [keys.lookups(tenant.id)],
    onSuccess: () => {
      setSelected([]);
    },
  });

  const toggleItem = (id: string, checked: boolean) => {
    setSelected((current) => {
      const filtered = current.filter((itemId) => itemIds.has(itemId) && itemId !== id);
      return checked ? [...filtered, id] : filtered;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? items.map((item) => item.id) : []);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction className="flex items-center gap-2">
          {onPull ? (
            <Button type="button" size="sm" className="h-8" disabled={pullPending} onClick={onPull}>
              Pull from source
            </Button>
          ) : null}
          {!readOnly && activeSelected.length > 0 ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-8"
              disabled={bulkRemove.isPending}
              onClick={() => setConfirmBulkDelete(true)}
            >
              <Trash2Icon />
              Delete ({activeSelected.length})
            </Button>
          ) : null}
          {!readOnly ? (
            <Button type="button" size="sm" className="h-8" onClick={() => setCreating(true)}>
              <PlusIcon />
              Add
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.length ? (
          <div className="overflow-hidden rounded-lg border">
            {!readOnly ? (
              <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <Checkbox
                  aria-label={`Select all ${title.toLowerCase()}`}
                  checked={allSelected}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                />
                <span>
                  {activeSelected.length > 0
                    ? `${activeSelected.length} of ${items.length} selected`
                    : `Select all (${items.length})`}
                </span>
              </div>
            ) : null}
            <ul className="divide-y">
              {items.map((item) => {
                const label = item.name ?? item.title ?? "";
                const isSelected = activeSelected.includes(item.id);
                return (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                    {!readOnly ? (
                      <Checkbox
                        aria-label={`Select ${label}`}
                        checked={isSelected}
                        onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
                    {!readOnly ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${label}`}
                          onClick={() => setEditing(item)}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${label}`}
                          onClick={() => setPendingDelete(item)}
                        >
                          <Trash2Icon />
                        </Button>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <EmptyState icon={Icon} title={`No ${title.toLowerCase()} yet`} className="py-8" />
        )}
      </CardContent>
      {!readOnly ? (
        <>
          <NamedEntityDialog kind={kind} open={creating} onOpenChange={setCreating} />
          <NamedEntityDialog
            kind={kind}
            entity={editing ? { id: editing.id, name: editing.name ?? editing.title ?? "" } : null}
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
          />
          <ConfirmDialog
            open={pendingDelete !== null}
            onOpenChange={(open) => !open && setPendingDelete(null)}
            title={`Delete ${pendingDelete?.name ?? pendingDelete?.title ?? "this item"}?`}
            description="Time already logged against it stays, but you will not be able to pick it for new entries."
            onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
          />
          <ConfirmDialog
            open={confirmBulkDelete}
            onOpenChange={setConfirmBulkDelete}
            title={`Delete ${activeSelected.length} ${
              activeSelected.length === 1 ? "selected item" : `selected ${title.toLowerCase()}`
            }?`}
            description="Time already logged against them stays, but you will not be able to pick them for new entries."
            onConfirm={() => activeSelected.length > 0 && bulkRemove.mutate(activeSelected)}
          />
        </>
      ) : null}
    </Card>
  );
}
