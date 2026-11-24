import type { Metadata } from "next";
import { ExternalSystemsView } from "./external-systems-view";

export const metadata: Metadata = { title: "External systems" };

export default function ExternalSystemsPage() {
  return <ExternalSystemsView />;
}
