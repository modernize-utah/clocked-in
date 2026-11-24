import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/server/dal";

export default async function SettingsIndex() {
  const workspace = await getWorkspace();
  redirect(workspace.isAdmin ? "/settings/tenant" : "/settings/lists");
}
