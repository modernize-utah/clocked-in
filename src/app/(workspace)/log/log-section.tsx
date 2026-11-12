"use client";

import type { ReactNode } from "react";
import { DialogActionsProvider, DialogActionsSlot } from "@/components/dialog-actions";
import { SectionLayout } from "@/components/section-layout";
import { LogNav, LogTypeMenu } from "./log-nav";

export function LogSection({ children }: { children: ReactNode }) {
  return (
    <DialogActionsProvider plain>
      <SectionLayout contained footer={<LogSaveBar />} headerAction={<LogTypeMenu />} nav={<LogNav />}>
        {children}
      </SectionLayout>
    </DialogActionsProvider>
  );
}

function LogSaveBar() {
  return (
    <DialogActionsSlot className="empty:hidden border-t pt-3 [&_button]:max-sm:w-full" />
  );
}
