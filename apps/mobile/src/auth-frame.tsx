import { ClockIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandRule } from "@/shell";
import { useColors } from "@/theme";
import { Panel } from "@/ui";

/** The signed-out frame: the VolunTime brand above one centered card. */
export function AuthFrame({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View style={{ height: 56, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 }}>
          <View style={{ width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }}>
            <ClockIcon color={colors.highlight} size={16} />
          </View>
          <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "600", letterSpacing: -0.2 }}>VolunTime</Text>
        </View>
        <BrandRule />
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }} keyboardShouldPersistTaps="handled">
        <Panel style={{ width: "100%", maxWidth: 420, alignSelf: "center" }}>
          <View style={{ padding: 20, gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.cardForeground, fontSize: 22, fontWeight: "600", letterSpacing: -0.3 }}>{title}</Text>
              {description ? <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 20 }}>{description}</Text> : null}
            </View>
            {children}
          </View>
        </Panel>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
