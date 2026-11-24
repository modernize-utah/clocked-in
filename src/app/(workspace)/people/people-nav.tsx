"use client";

import { LinkIcon, ShieldIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { SectionNav } from "@/components/section-nav";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";

export function PeopleNav() {
  const { isAdmin } = useWorkspace();
  const tenant = useTenant();
  const externalPeople = Boolean(tenant.preferences.portalDirectorySync);
  const items = [
    { href: "/people", label: "People", icon: UsersIcon, exact: true },
    ...(externalPeople ? [] : [{ href: "/people/invites", label: "Invites", icon: UserPlusIcon }]),
    { href: "/people/connections", label: "Connections", icon: LinkIcon, admin: true },
    { href: "/people/roles", label: "Roles", icon: ShieldIcon, admin: true },
  ];

  return <SectionNav items={items.filter((item) => !item.admin || isAdmin)} />;
}
