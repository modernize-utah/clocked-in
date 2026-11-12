import { Text, View } from "react-native";
import type { ReportBucket } from "@/api/types";
import { formatNumber } from "@/format";
import { useColors } from "@/theme";
import { mono, Panel, PanelHeader } from "@/ui";

export function Breakdown({ title, rows, limit = 8 }: { title: string; rows: ReportBucket[]; limit?: number }) {
  const colors = useColors();
  const top = rows.slice(0, limit);
  const max = Math.max(1, ...top.map((row) => row.hours));
  return (
    <Panel>
      <PanelHeader title={title} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
        {top.length === 0 ? <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No hours yet.</Text> : null}
        {top.map((row) => (
          <View key={row.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, color: colors.cardForeground, fontSize: 14 }}>
                {row.label || "Unclassified"}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: mono }}>{formatNumber(row.hours)} h</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" }}>
              <View style={{ height: 6, borderRadius: 3, width: `${(row.hours / max) * 100}%`, backgroundColor: colors.primary }} />
            </View>
          </View>
        ))}
      </View>
    </Panel>
  );
}

export function Stat({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ComponentType<{ color?: string; size?: number }> }) {
  const colors = useColors();
  return (
    <Panel style={{ flexBasis: "47%", flexGrow: 1, padding: 14, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{label}</Text>
        {Icon ? <Icon color={colors.mutedForeground} size={16} /> : null}
      </View>
      <Text style={{ color: colors.cardForeground, fontSize: 24, fontWeight: "600", fontFamily: mono }}>{value}</Text>
    </Panel>
  );
}
