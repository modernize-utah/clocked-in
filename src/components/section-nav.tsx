"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type LinkItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };
type StateItem<T extends string> = { id: T; label: string; icon: LucideIcon };
type Entry = { key: string; label: string; icon: LucideIcon; current: boolean };

/** Section navigation: links by default, or local state when `value` and `onValueChange` are passed. */
export function SectionNav<T extends string>(
  props: (
    | { items: LinkItem[]; label?: string }
    | { items: StateItem<T>[]; value: T; onValueChange: (value: T) => void; label?: string }
  ) & {
    /** Compact screen presentation. `icon` is a single button that opens the menu. */
    mobile?: "dropdown" | "icon" | "none";
    /** Show the vertical link list from the `lg` breakpoint up. */
    desktop?: boolean;
  },
) {
  const pathname = usePathname();
  const mobile = props.mobile ?? "dropdown";
  const desktop = props.desktop !== false;
  const entries: Entry[] =
    "value" in props
      ? props.items.map((item) => ({ key: item.id, label: item.label, icon: item.icon, current: item.id === props.value }))
      : props.items.map((item) => ({
          key: item.href,
          label: item.label,
          icon: item.icon,
          current: item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`),
        }));
  const active = entries.find((entry) => entry.current) ?? entries[0];
  const choose = (key: string) => {
    if ("value" in props) props.onValueChange(key as T);
  };
  const itemClass = (current: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm whitespace-nowrap transition-colors",
      current
        ? "border-foreground/10 bg-card font-medium text-foreground shadow-xs"
        : "border-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground",
    );
  const menuItems = entries.map((entry) => {
    const current = entry.key === active?.key;
    return (
      <DropdownMenuItem
        key={entry.key}
        className={cn(current && "bg-accent font-medium text-accent-foreground")}
        {...("value" in props
          ? { onClick: () => choose(entry.key) }
          : { render: <Link href={entry.key} aria-current={current ? "page" : undefined} /> })}
      >
        <entry.icon />
        {entry.label}
      </DropdownMenuItem>
    );
  });

  return (
    <>
      {mobile === "none" ? null : (
        <nav aria-label={props.label ?? "Sections"} className={cn("lg:hidden", mobile === "icon" && "w-fit")}>
          <DropdownMenu>
            {mobile === "icon" ? (
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    aria-label={active ? `${props.label ?? "Section"}: ${active.label}` : (props.label ?? "Sections")}
                    title={active?.label}
                  />
                }
              >
                {active ? <active.icon /> : null}
              </DropdownMenuTrigger>
            ) : (
              <DropdownMenuTrigger
                render={<Button type="button" variant="outline" className="h-9 w-full justify-between px-3 font-medium" />}
              >
                {active ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <active.icon />
                    <span className="truncate">{active.label}</span>
                  </span>
                ) : null}
                <ChevronDownIcon data-icon="inline-end" />
              </DropdownMenuTrigger>
            )}
            <DropdownMenuContent align={mobile === "icon" ? "end" : "start"} className={mobile === "icon" ? "w-56" : "w-(--anchor-width)"}>
              {menuItems}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      )}
      {desktop ? (
        <nav aria-label={props.label ?? "Sections"} className="hidden min-h-0 overflow-y-auto overscroll-y-contain lg:block">
          <ul className="flex flex-col gap-1">
            {entries.map((entry) => (
              <li key={entry.key}>
                {"value" in props ? (
                  <button
                    type="button"
                    aria-current={entry.current ? "page" : undefined}
                    onClick={() => choose(entry.key)}
                    className={itemClass(entry.current)}
                  >
                    <entry.icon className="size-4" />
                    {entry.label}
                  </button>
                ) : (
                  <Link href={entry.key} aria-current={entry.current ? "page" : undefined} className={itemClass(entry.current)}>
                    <entry.icon className="size-4" />
                    {entry.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </>
  );
}
