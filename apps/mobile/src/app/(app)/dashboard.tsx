import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { PlusIcon } from "lucide-react-native";
import { View } from "react-native";
import { api } from "@/api/client";
import type { ReportCard } from "@/api/types";
import { UnclassifiedBanner } from "@/log-views";
import { defaultDashboardCards, ReportGrid } from "@/report-grid";
import { Button, ErrorText, Loading, PageTitle, Screen } from "@/ui";
import { useWorkspace } from "@/workspace";

function welcome(name: string) {
  const first = name.trim().split(/\s+/)[0];
  return first ? `Welcome back, ${first}` : "Welcome back";
}

function webOrigin() {
  return (process.env.EXPO_PUBLIC_WEB_URL || process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:3025").replace(/\/$/, "");
}

export default function DashboardScreen() {
  const { viewer, organization, isAdmin } = useWorkspace();
  const saved = useQuery({
    queryKey: ["saved-reports", organization.id],
    queryFn: () => api.savedReports(organization.id),
  });
  const dashboard = saved.data?.items.find((item) => item.isDashboard);
  const report = useQuery({
    queryKey: ["report", organization.id, dashboard?.id ?? "default"],
    queryFn: () => api.report(organization.id, dashboard?.filters.from || dashboard?.filters.to ? { from: dashboard.filters.from, to: dashboard.filters.to } : undefined),
  });
  if (saved.isLoading || report.isLoading) return <Loading />;
  const cards = (dashboard?.layout.cards as ReportCard[] | undefined) ?? defaultDashboardCards();

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <PageTitle title={welcome(viewer.name)} />
        </View>
        <Button icon={PlusIcon} label="Log time" onPress={() => router.navigate("/log")} />
      </View>
      {isAdmin ? (
        <Button label="Edit dashboard on web" onPress={() => void WebBrowser.openBrowserAsync(`${webOrigin()}/dashboard/design`)} variant="outline" />
      ) : null}
      <UnclassifiedBanner />
      <ErrorText error={report.error ?? saved.error} />
      <ReportGrid cards={cards} data={report.data} />
    </Screen>
  );
}
