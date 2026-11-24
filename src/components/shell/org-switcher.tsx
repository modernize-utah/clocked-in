"use client";

import { BuildingIcon, CheckIcon, ChevronDownIcon, ClockIcon, PlusIcon } from "lucide-react";
import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { switchTenantAction } from "@/app/actions/tenants";
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
import type { Tenant } from "@/lib/types";

export function OrgSwitcher() {
  const { tenants, tenant, isTenantHost, pinnedTenantName } = useWorkspace();
  const [pending, startTransition] = useTransition();
  const label = tenant?.name ?? pinnedTenantName ?? "VolunTime";

  if (isTenantHost) {
    return (
      <Link href="/" className="flex min-w-0 items-center gap-2.5">
        <OrgBrand tenant={tenant} label={label} />
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className="flex min-w-0 cursor-pointer items-center gap-2 text-left outline-hidden ring-sidebar-ring transition-opacity focus-visible:ring-2 disabled:opacity-50 group-data-[collapsible=icon]:gap-0"
      >
        <OrgBrand tenant={tenant} label={label} />
        <ChevronDownIcon className="size-3.5 shrink-0 text-sidebar-foreground/70 group-data-[collapsible=icon]:size-2.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tenants</DropdownMenuLabel>
          {tenants.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() => {
                if (item.id === tenant?.id) return;
                startTransition(async () => {
                  const result = await switchTenantAction(item.id);
                  if (!result.ok) toast.error(result.error);
                });
              }}
            >
              <OrgLogo tenant={item} fallback={false} />
              <span className="truncate">{item.name}</span>
              {item.id === tenant?.id ? <CheckIcon className="ml-auto" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/tenant/new" />}>
          <PlusIcon />
          New tenant
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OrgBrand({
  tenant,
  label,
}: {
  tenant: Tenant | null;
  label: string;
}) {
  const markUrl = brandAssetSrc("mark", tenant?.markUrl ?? null);
  const wordmarkUrl = wordmarkSrc(tenant, "dark");

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
  tenant,
  fallback = true,
}: {
  tenant: Pick<Tenant, "markUrl"> | null;
  fallback?: boolean;
}) {
  const src = brandAssetSrc("mark", tenant?.markUrl ?? null);
  if (!src) {
    return fallback ? <BuildingIcon className="text-muted-foreground" /> : null;
  }

  return (
    <img src={src} alt="" width={20} height={20} className="size-5 shrink-0 object-contain" />
  );
}
