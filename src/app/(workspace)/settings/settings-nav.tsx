"use client";

import {
  BuildingIcon,
  ImageIcon,
  ListTreeIcon,
  MailIcon,
  NetworkIcon,
  PaletteIcon,
  PlugIcon,
  UploadIcon,
} from "lucide-react";
import { SectionNav } from "@/components/section-nav";
import { useLabels } from "@/hooks/use-labels";
import { useWorkspace } from "@/hooks/use-workspace";

export function SettingsNav() {
  const { isAdmin } = useWorkspace();
  const copy = useLabels();
  const items = [
    { href: "/settings/tenant", label: copy.tenant, icon: BuildingIcon, admin: true },
    { href: "/settings/organizations", label: copy.organizations, icon: NetworkIcon, admin: true },
    { href: "/settings/lists", label: `${copy.projects} & lists`, icon: ListTreeIcon },
    { href: "/settings/import", label: "Import", icon: UploadIcon, admin: true },
    { href: "/settings/external", label: "External systems", icon: PlugIcon, admin: true },
    { href: "/settings/theme", label: "Themes", icon: PaletteIcon, admin: true },
    { href: "/settings/brand", label: "Brand", icon: ImageIcon, admin: true },
    { href: "/settings/email", label: "Email", icon: MailIcon, admin: true },
  ];

  return <SectionNav items={items.filter((item) => !item.admin || isAdmin)} />;
}
