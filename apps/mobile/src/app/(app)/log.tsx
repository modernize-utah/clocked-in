import { router, useLocalSearchParams } from "expo-router";
import { Link2Icon, TimerIcon, UserRoundIcon, UsersIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { canLogConnectionTime, canLogGroupTime, canLogMemberTime } from "@/gates";
import { ConnectionTimeView, GroupTimeView, MemberTimeView, OwnTimeView, useConnections } from "@/log-views";
import { useColors } from "@/theme";
import { Menu, PageTitle, Screen } from "@/ui";
import { useWorkspace } from "@/workspace";

type LogView = "own" | "member" | "connections" | "group";

export default function LogScreen() {
  const workspace = useWorkspace();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const connections = useConnections();
  const params = useLocalSearchParams<{ view?: string; person?: string }>();
  const items = [
    { id: "own" as const, label: "Log Own Time", icon: TimerIcon },
    ...(canLogMemberTime(workspace) ? [{ id: "member" as const, label: "Log Member Time", icon: UserRoundIcon }] : []),
    ...(canLogConnectionTime(workspace, connections.data?.items.length ?? 0)
      ? [{ id: "connections" as const, label: "Log Connection Time", icon: Link2Icon }]
      : []),
    ...(canLogGroupTime(workspace) || workspace.permissions.includes("log_event_totals")
      ? [{ id: "group" as const, label: "Log Group Time", icon: UsersIcon }]
      : []),
  ];
  const view: LogView = items.find((item) => item.id === params.view)?.id ?? "own";
  const active = items.find((item) => item.id === view) ?? items[0];

  return (
    <Screen scroll={false}>
      <View
        style={{
          alignSelf: "center",
          flex: 1,
          gap: 16,
          maxWidth: 760,
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16),
          width: "100%",
        }}
      >
        <PageTitle
          action={
            items.length > 1 && active ? (
              <Menu
                align="end"
                items={items.map((item) => ({
                  label: item.label,
                  icon: item.icon,
                  checked: item.id === active.id,
                  onPress: () => router.setParams({ view: item.id }),
                }))}
                trigger={(show) => (
                  <Pressable
                    accessibilityLabel={`Log type: ${active.label}`}
                    accessibilityRole="button"
                    onPress={show}
                    style={{
                      alignItems: "center",
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      borderRadius: 10,
                      borderWidth: 1,
                      height: 40,
                      justifyContent: "center",
                      width: 40,
                    }}
                  >
                    <active.icon color={colors.foreground} size={18} />
                  </Pressable>
                )}
                width={240}
              />
            ) : null
          }
          title="Log time"
        />
        <View style={{ flex: 1, minHeight: 0 }}>
          {view === "own" ? <OwnTimeView /> : null}
          {view === "member" ? <MemberTimeView personId={typeof params.person === "string" ? params.person : undefined} /> : null}
          {view === "connections" ? <ConnectionTimeView /> : null}
          {view === "group" ? <GroupTimeView /> : null}
        </View>
      </View>
    </Screen>
  );
}
