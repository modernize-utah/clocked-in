import { cn } from "cn";
import { PageHeader } from "@/components/page-header";
import { SectionPanel } from "@/components/section-panel";

export function SectionLayout({
  nav,
  children,
  footer,
  scrollKey,
  headerAction,
  contained = false,
}: {
  nav: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollKey?: string;
  /** Sits on the right of the page title. Used for the compact section menu. */
  headerAction?: React.ReactNode;
  /** Fill the shell and let the section scroll internally, on every breakpoint. */
  contained?: boolean;
}) {
  return (
    <div
      data-section-layout
      className={cn(
        "flex flex-1 flex-col gap-6 lg:min-h-0 lg:overflow-hidden",
        contained && "min-h-0 gap-4 overflow-hidden",
      )}
    >
      <PageHeader
        className={cn("shrink-0", contained && "lg:hidden")}
        actions={headerAction}
        inline={contained && Boolean(headerAction)}
      />
      <div
        className={cn(
          "grid flex-1 grid-rows-[auto_minmax(0,1fr)] gap-6 lg:min-h-0 lg:grid-cols-[14rem_minmax(0,1fr)] lg:grid-rows-1 lg:overflow-hidden",
          contained && "min-h-0 grid-rows-[minmax(0,1fr)] gap-4 overflow-hidden",
        )}
      >
        {nav}
        <SectionPanel contained={contained} footer={footer} scrollKey={scrollKey}>
          {children}
        </SectionPanel>
      </div>
    </div>
  );
}
