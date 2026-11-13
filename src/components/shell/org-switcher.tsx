"use client";

import { BuildingIcon, CheckIcon, ChevronDownIcon, ClockIcon, PlusIcon } from "lucide-react";
import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { switchOrganizationAction } from "@/app/actions/organizations";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/hooks/use-workspace";
import { brandAssetSrc, wordmarkSrc } from "@/lib/brand";
import type { Organization } from "@/lib/types";

export function OrgSwitcher() {
  const { organizations, organization, isTenantHost, pinnedOrganizationName } = useWorkspace();
  const [pending, startTransition] = useTransition();
  const label = organization?.name ?? pinnedOrganizationName ?? "VolunTime";

  if (isTenantHost) {
    return (
      <Link href="/" className="flex min-w-0 items-center gap-2.5">
        <OrgBrand organization={organization} label={label} />
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className="flex min-w-0 cursor-pointer items-center gap-2 text-left outline-hidden ring-sidebar-ring transition-opacity focus-visible:ring-2 disabled:opacity-50 group-data-[collapsible=icon]:gap-0"
      >
        <OrgBrand organization={organization} label={label} />
        <ChevronDownIcon className="size-3.5 shrink-0 text-sidebar-foreground/70 group-data-[collapsible=icon]:size-2.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          {organizations.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() => {
                if (item.id === organization?.id) return;
                startTransition(async () => {
                  const result = await switchOrganizationAction(item.id);
                  if (!result.ok) toast.error(result.error);
                });
              }}
            >
              <OrgLogo organization={item} fallback={false} />
              <span className="truncate">{item.name}</span>
              {item.id === organization?.id ? <CheckIcon className="ml-auto" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/organization/new" />}>
          <PlusIcon />
          New organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OrgBrand({
  organization,
  label,
}: {
  organization: Organization | null;
  label: string;
}) {
  const markUrl = brandAssetSrc("mark", organization?.markUrl ?? null);
  const wordmarkUrl = wordmarkSrc(organization, "dark");

  return (
    <>
      {markUrl ? (
        <img src={markUrl} alt="" width={32} height={32} className="size-8 shrink-0 rounded-md object-contain" />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <ClockIcon className="size-4" />
        </span>
      )}
      {wordmarkUrl ? (
        <>
          <img
            src={wordmarkUrl}
            alt=""
            height={28}
            className="h-7 max-w-36 object-contain group-data-[collapsible=icon]:hidden"
          />
          <span className="sr-only">{label}</span>
        </>
      ) : (
        <span className="truncate font-heading text-base font-semibold tracking-tight group-data-[collapsible=icon]:sr-only">
          {label}
        </span>
      )}
    </>
  );
}

function OrgLogo({
  organization,
  fallback = true,
}: {
  organization: Pick<Organization, "markUrl"> | null;
  fallback?: boolean;
}) {
  const src = brandAssetSrc("mark", organization?.markUrl ?? null);
  if (!src) {
    return fallback ? <BuildingIcon className="text-muted-foreground" /> : null;
  }

  return (
    <img src={src} alt="" width={20} height={20} className="size-5 shrink-0 object-contain" />
  );
}
