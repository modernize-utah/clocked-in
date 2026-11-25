"use client";

import { PageHeader } from "@/components/page-header";
import { SectionPanel } from "@/components/section-panel";

export function EditorLayout({ footer, children }: { footer?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-6 lg:min-h-0 lg:overflow-hidden">
      <PageHeader className="shrink-0" />
      <SectionPanel footer={footer}>{children}</SectionPanel>
    </div>
  );
}
