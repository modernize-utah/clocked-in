"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";

export function NavLink({
  href,
  label,
  excludePrefix,
  children,
}: {
  href: string;
  label: string;
  excludePrefix?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const excluded = excludePrefix
    ? pathname === excludePrefix || pathname.startsWith(`${excludePrefix}/`)
    : false;
  const active = !excluded && (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={label}
        render={<Link href={href} onClick={() => setOpenMobile(false)} />}
      >
        {children}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
