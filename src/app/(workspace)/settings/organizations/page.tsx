import type { Metadata } from "next";
import { OrganizationsView } from "./organizations-view";

export const metadata: Metadata = { title: "Organizations" };

export default function OrganizationsPage() {
  return <OrganizationsView />;
}
