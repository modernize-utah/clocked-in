import { useMutation } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { router, usePathname, type Href } from "expo-router";
import {
  BarChart3Icon,
  BookOpenIcon,
  BuildingIcon,
  ChevronDownIcon,
  ClockIcon,
  HandHeartIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  LogOutIcon,
  MenuIcon,
  PlusIcon,
  SettingsIcon,
  SquareIcon,
  TimerIcon,
  UserRoundIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/api/client";
import type { Organization } from "@/api/types";
import { FeedbackButton } from "@/feedback-dialog";
import { formatClock } from "@/format";
import { canManageSettings, canSeeReports } from "@/gates";
import { useSession } from "@/session";
import { useColors } from "@/theme";
import { IconButton, Menu, mono } from "@/ui";
import { useElapsed, useOpenPunch, useRefreshTime, useWorkspace } from "@/workspace";

type NavItem = { href: string; label: string; icon: LucideIcon; show?: boolean; external?: string };

function webOrigin() {
  return (process.env.EXPO_PUBLIC_WEB_URL || process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:3025").replace(/\/$/, "");
}

function useSections() {
  const workspace = useWorkspace();
  const manage = workspace.isAdmin || workspace.isCoordinator;
  const sections: { label: string; links: NavItem[] }[] = [
    {
      label: "Workspace",
      links: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
        { href: "/log", label: "Log time", icon: TimerIcon },
        { href: "/entries", label: "Entries", icon: ListChecksIcon },
        { href: "/reports", label: "Reports", icon: BarChart3Icon, show: canSeeReports(workspace) },
      ],
    },
    {
      label: "Manage",
      links: [
        { href: "/needs", label: "Needs", icon: HandHeartIcon, show: manage },
        { href: "/people", label: "People", icon: UsersIcon, show: manage },
        { href: "/settings", label: "Settings", icon: SettingsIcon, show: canManageSettings(workspace) },
      ],
    },
    {
      label: "Resources",
      links: [
        { href: "/resources/dashboard", label: "Design dashboard", icon: LayoutDashboardIcon, external: "/dashboard/design", show: workspace.isAdmin },
        { href: "/resources/report", label: "Report designer", icon: BarChart3Icon, external: "/reports/new", show: workspace.isAdmin || workspace.permissions.includes("design_reports") },
        { href: "/resources/email", label: "Email templates", icon: BookOpenIcon, external: "/settings/email", show: workspace.isAdmin },
        { href: "/resources/import", label: "Import", icon: BookOpenIcon, external: "/settings/import", show: workspace.isAdmin },
        { href: "/resources/developer", label: "Developer", icon: BookOpenIcon, external: "/developer", show: workspace.viewer.isSuperAdmin },
        { href: "/resources/feedback", label: "Feedback list", icon: BookOpenIcon, external: "/feedback" },
        { href: "/resources/about", label: "About the prototype", icon: BookOpenIcon, external: "/about-prototype" },
      ],
    },
  ];
  return sections
    .map((section) => ({ ...section, links: section.links.filter((link) => link.show !== false) }))
    .filter((section) => section.links.length > 0);
}

export function AppHeader() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <View style={{ backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={styles.header}>
        <IconButton icon={MenuIcon} label="Open navigation" onPress={() => setMenuOpen(true)} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <OrgSwitcher />
        </View>
        <TimerChip />
        <FeedbackButton />
        <UserMenu />
      </View>
      <BrandRule />
      <Sidebar onClose={() => setMenuOpen(false)} open={menuOpen} />
    </View>
  );
}

export function BrandRule() {
  const colors = useColors();
  return (
    <LinearGradient
      colors={[colors.brandAccent, colors.highlight, colors.success]}
      end={{ x: 1, y: 0 }}
      start={{ x: 0, y: 0 }}
      style={{ height: 3 }}
    />
  );
}

function markSource(organization: Pick<Organization, "markUrl">) {
  const url = organization.markUrl;
  if (!url || !/^https?:\/\//i.test(url) || /blob\.vercel-storage\.com/i.test(url)) return null;
  return { uri: url };
}

function OrgMark({ organization, size = 32, onDark = false }: { organization: Organization; size?: number; onDark?: boolean }) {
  const colors = useColors();
  const source = markSource(organization);
  if (source) return <Image resizeMode="contain" source={source} style={{ width: size, height: size, borderRadius: 8 }} />;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 9,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: onDark ? colors.highlight : colors.primary,
      }}
    >
      <ClockIcon color={onDark ? colors.primary : colors.primaryForeground} size={size / 2} />
    </View>
  );
}

function OrgSwitcher({ onDark = false, onNavigate }: { onDark?: boolean; onNavigate?: () => void }) {
  const colors = useColors();
  const { organization, organizations, switchOrganization, switching } = useWorkspace();
  const foreground = onDark ? colors.primaryForeground : colors.foreground;
  return (
    <Menu
      items={[
        { kind: "label", label: "Organizations" },
        ...organizations.map((item) => ({
          label: item.name,
          checked: item.id === organization.id,
          leading: <OrgMark organization={item} size={20} />,
          onPress: () => {
            onNavigate?.();
            if (item.id !== organization.id) void switchOrganization(item.id);
          },
        })),
        { kind: "separator" as const },
        {
          label: "New organization",
          icon: PlusIcon,
          onPress: () => {
            onNavigate?.();
            router.push("/empty");
          },
        },
      ]}
      trigger={(show) => (
        <Pressable
          accessibilityLabel="Switch organization"
          accessibilityRole="button"
          disabled={switching}
          onPress={show}
          style={[styles.orgTrigger, { opacity: switching ? 0.5 : 1 }]}
        >
          <OrgMark onDark={onDark} organization={organization} />
          <Text numberOfLines={1} style={[styles.orgName, { color: foreground }]}>
            {organization.name}
          </Text>
          <ChevronDownIcon color={onDark ? colors.sidebarMuted : colors.mutedForeground} size={14} />
        </Pressable>
      )}
    />
  );
}

function TimerChip() {
  const colors = useColors();
  const { punch } = useOpenPunch();
  const elapsed = useElapsed(punch?.startedAt);
  const refresh = useRefreshTime();
  const stop = useMutation({ mutationFn: () => api.clockOut({}), onSuccess: () => refresh() });

  if (!punch) {
    return (
      <Pressable
        accessibilityLabel="Add Time"
        accessibilityRole="button"
        onPress={() => router.navigate("/log")}
        style={({ pressed }) => [styles.addTime, pressed ? { backgroundColor: colors.muted } : null]}
      >
        <PlusIcon color={colors.primary} size={16} />
        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "500" }}>Add Time</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={[styles.dot, { backgroundColor: colors.success }]} />
      <Pressable onPress={() => router.navigate("/log")}>
        <Text style={{ fontFamily: mono, fontSize: 13, color: colors.foreground }}>{formatClock(elapsed)}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Stop timer"
        accessibilityRole="button"
        disabled={stop.isPending}
        onPress={() => stop.mutate()}
        style={[styles.stop, { backgroundColor: colors.destructive, opacity: stop.isPending ? 0.5 : 1 }]}
      >
        <SquareIcon color="#FFFFFF" fill="#FFFFFF" size={10} />
      </Pressable>
    </View>
  );
}

function UserMenu() {
  const colors = useColors();
  const { viewer, organization, isAdmin, isCoordinator } = useWorkspace();
  const { logout } = useSession();
  return (
    <Menu
      align="end"
      header={
        <View style={{ paddingHorizontal: 10, paddingVertical: 8, gap: 2 }}>
          <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "500" }}>
            {viewer.name}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12 }}>
            {viewer.email}
          </Text>
          {isAdmin ? <Text style={{ color: colors.highlight, fontSize: 12 }}>Organization admin</Text> : null}
          {!isAdmin && isCoordinator ? <Text style={{ color: colors.highlight, fontSize: 12 }}>Group manager</Text> : null}
        </View>
      }
      items={[
        { kind: "separator" },
        { label: "Profile", icon: UserRoundIcon, onPress: () => router.navigate("/profile") },
        { label: organization.name, icon: BuildingIcon, onPress: () => router.navigate("/organization") },
        { label: "Accept an invite", icon: UserRoundIcon, onPress: () => router.navigate("/accept") },
        { kind: "separator" as const },
        { label: "Sign out", icon: LogOutIcon, destructive: true, onPress: () => void logout() },
      ]}
      trigger={(show) => (
        <Pressable accessibilityLabel="Account menu" accessibilityRole="button" onPress={show} style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={{ color: colors.primaryForeground, fontSize: 12, fontWeight: "600" }}>{viewer.initials}</Text>
        </Pressable>
      )}
      width={240}
    />
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const sections = useSections();

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={[styles.sidebar, { width: Math.min(300, width * 0.84), backgroundColor: colors.primary, paddingTop: insets.top }]}>
          <View style={[styles.sidebarHeader, { borderColor: colors.sidebarBorder }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <OrgSwitcher onDark onNavigate={onClose} />
            </View>
            <IconButton color={colors.primaryForeground} icon={XIcon} label="Close navigation" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
            {sections.map((section) => (
              <View key={section.label} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                <Text style={[styles.sectionLabel, { color: colors.sidebarMuted }]}>{section.label}</Text>
                {section.links.map((link) => {
                  const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
                  return (
                    <Pressable
                      accessibilityRole="link"
                      accessibilityState={{ selected: active }}
                      key={link.href}
                      onPress={() => {
                        onClose();
                        if (link.external) {
                          void WebBrowser.openBrowserAsync(`${webOrigin()}${link.external}`);
                          return;
                        }
                        router.navigate(link.href as Href);
                      }}
                      style={({ pressed }) => [
                        styles.navLink,
                        { backgroundColor: active || pressed ? colors.sidebarAccent : "transparent" },
                      ]}
                    >
                      <link.icon color={colors.primaryForeground} size={18} />
                      <Text style={{ color: colors.primaryForeground, fontSize: 14, fontWeight: active ? "600" : "400" }}>{link.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
        <Pressable accessibilityLabel="Close navigation" onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { height: 56, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8 },
  orgTrigger: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0, paddingVertical: 4, paddingRight: 4 },
  orgName: { flexShrink: 1, fontSize: 16, fontWeight: "600", letterSpacing: -0.2 },
  addTime: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 10, borderRadius: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, height: 36, borderWidth: 1, borderRadius: 999, paddingLeft: 12, paddingRight: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stop: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginLeft: 2 },
  sidebar: { height: "100%" },
  sidebarHeader: { height: 64, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderBottomWidth: 1 },
  sectionLabel: { fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", paddingHorizontal: 8, paddingBottom: 6 },
  navLink: { flexDirection: "row", alignItems: "center", gap: 12, height: 40, paddingHorizontal: 10, borderRadius: 8 },
});
