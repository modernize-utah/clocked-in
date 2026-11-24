import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/server/dal";
import { InvitesView } from "./invites-view";

export const metadata = { title: "Invites" };

export default async function InvitesPage() {
  const tenant = await getCurrentTenant();
  if (tenant?.preferences.portalDirectorySync) {
    redirect("/people");
  }
  return <InvitesView />;
}
