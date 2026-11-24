"use client";

import { NetworkIcon } from "lucide-react";
import { pullPortalDirectoryAction } from "@/app/actions/external-sync";
import { LookupListCard } from "@/components/lookup-list";
import { PageSkeleton } from "@/components/skeletons";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useLabels } from "@/hooks/use-labels";
import { useLookups } from "@/hooks/use-lookups";
import { useTenant } from "@/hooks/use-workspace";
import { keys } from "@/lib/queries";

export function OrganizationsView() {
  const tenant = useTenant();
  const { lookups, isPending } = useLookups();
  const copy = useLabels();
  const external = tenant.preferences.portalDirectorySync === true;
  const pull = useActionMutation(() => pullPortalDirectoryAction(tenant.id), {
    invalidate: [keys.lookups(tenant.id)],
  });
  if (isPending) return <PageSkeleton rows={4} />;
  return (
    <LookupListCard
      kind="organizations"
      title={copy.organizations}
      description={
        external
          ? `${copy.organizations} are managed by an external system of record.`
          : `Teams or sites inside this ${copy.tenant.toLowerCase()}. Hours can be logged against a ${copy.organization.toLowerCase()}, and reports break down by it.`
      }
      items={lookups.organizations}
      icon={NetworkIcon}
      readOnly={external}
      onPull={external ? () => pull.mutate() : undefined}
      pullPending={pull.isPending}
    />
  );
}
