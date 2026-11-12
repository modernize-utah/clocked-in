"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function SectionPanel({
  children,
  footer,
  scrollKey,
  contained = false,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollKey?: string;
  contained?: boolean;
}) {
  const pathname = usePathname();
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
    scroller.current?.closest("[data-shell-frame]")?.scrollTo(0, 0);
  }, [pathname, scrollKey]);

  if (contained) {
    return (
      <div ref={scroller} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-0.5 lg:pe-4">
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        {footer ? <div className="shrink-0">{footer}</div> : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col lg:min-h-0">
      <div
        ref={scroller}
        className="lg:min-h-0 lg:shrink lg:overflow-y-auto lg:overscroll-y-contain lg:[scrollbar-gutter:stable]"
      >
        <div className="flex flex-col gap-6 px-0.5 py-0.5 lg:ps-0.5 lg:pe-4">{children}</div>
      </div>
      {footer ? (
        <div className="sticky bottom-0 z-10 shrink-0 bg-muted/40 px-0.5 pt-4 pb-0.5 lg:static lg:bg-transparent lg:ps-0.5 lg:pe-4">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
