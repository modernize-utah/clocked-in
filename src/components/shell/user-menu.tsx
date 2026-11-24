"use client";

import { BuildingIcon, LogOutIcon, MailOpenIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { avatarImageSrc } from "@/lib/avatar";
import { signOut } from "@/lib/lookup-persistence";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

export function UserMenu() {
  const { viewer, tenant, isAdmin, isCoordinator } = useWorkspace();
  const avatarSrc = avatarImageSrc(viewer.id, viewer.avatarUrl);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="size-9 rounded-full" aria-label="Account menu" />}
      >
        <Avatar className="size-8">
          {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
            {viewer.initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">{viewer.name}</span>
            <span className="truncate text-xs font-normal">{viewer.email}</span>
            {isAdmin ? <span className="text-xs font-normal text-highlight">Tenant admin</span> : null}
            {!isAdmin && isCoordinator ? <span className="text-xs font-normal text-highlight">Group manager</span> : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/profile" />}>
          <UserRoundIcon />
          Profile
        </DropdownMenuItem>
        {tenant ? (
          <DropdownMenuItem render={<Link href="/tenant" />} className="min-w-0">
            <BuildingIcon />
            <span className="truncate">{tenant.name}</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem render={<Link href="/accept" />}>
          <MailOpenIcon />
          Accept an invite
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void signOut()}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
