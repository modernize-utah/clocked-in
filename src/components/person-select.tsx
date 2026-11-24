"use client";

import { UserIcon } from "lucide-react";
import { SelectField } from "@/components/select-field";
import { useMembers } from "@/hooks/use-members";
import { useWorkspace } from "@/hooks/use-workspace";
import { canLogMemberTime } from "@/lib/roles";
import type { Membership } from "@/lib/types";

export function selectableMembers(
  members: Membership[],
  viewerId: string,
  options?: { excludeSelf?: boolean; activeOnly?: boolean },
) {
  return members.filter((member) => {
    if (options?.activeOnly && member.isActive !== true) return false;
    if (options?.excludeSelf && member.userId === viewerId) return false;
    return true;
  });
}

export function PersonSelect({
  value,
  onValueChange,
  className,
  excludeSelf = false,
  activeOnly = false,
  placeholder,
  allOption,
}: {
  value: string;
  onValueChange: (userId: string) => void;
  className?: string;
  excludeSelf?: boolean;
  activeOnly?: boolean;
  placeholder?: string;
  allOption?: { value: string; label: string };
}) {
  const { viewer, isAdmin, isCoordinator, groupOrganizations } = useWorkspace();
  const canPick = canLogMemberTime(isAdmin, groupOrganizations);
  const { members } = useMembers({ enabled: canPick });
  if (!canPick) return null;
  const scoped = isCoordinator
    ? members.filter((member) => (member.organizationIds ?? []).some((id) => groupOrganizations.includes(id)))
    : members;

  const options = selectableMembers(scoped, viewer.id, { excludeSelf, activeOnly }).map((member) => {
    const display = member.user.displayName?.trim();
    const full = [member.user.firstName, member.user.lastName].filter(Boolean).join(" ").trim();
    const name = display || full || member.user.username;
    return {
      value: member.userId,
      label: member.userId === viewer.id ? `${name} (you)` : name,
    };
  });
  if (!excludeSelf && !activeOnly && !options.some((option) => option.value === viewer.id)) {
    options.unshift({ value: viewer.id, label: `${viewer.username} (you)` });
  }
  if (allOption && !options.some((option) => option.value === allOption.value)) {
    options.unshift(allOption);
  }

  return (
    <div className="flex items-center gap-2">
      <UserIcon className="size-4 shrink-0 text-muted-foreground" />
      <SelectField
        aria-label="Person"
        className={className}
        value={value}
        onValueChange={onValueChange}
        options={options}
        placeholder={placeholder}
      />
    </div>
  );
}
