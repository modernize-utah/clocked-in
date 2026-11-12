import { Redirect, Stack } from "expo-router";
import { useSession } from "@/session";
import { AppHeader } from "@/shell";
import { useColors } from "@/theme";
import { Loading } from "@/ui";
import { WorkspaceProvider } from "@/workspace";

function AppStack() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        header: () => <AppHeader />,
        animation: "none",
        contentStyle: { backgroundColor: colors.canvas },
      }}
    />
  );
}

export default function AppLayout() {
  const { status } = useSession();
  if (status === "loading") return <Loading />;
  if (status !== "ready") return <Redirect href="/" />;
  return (
    <WorkspaceProvider>
      <AppStack />
    </WorkspaceProvider>
  );
}
