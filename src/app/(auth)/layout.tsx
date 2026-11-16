import { BarChart3Icon, HandCoinsIcon, TimerIcon } from "lucide-react";
import { Suspense } from "react";
import { PageLoader } from "@/components/skeletons";
import { brandCss, clockedInTheme } from "@/lib/brand";
import { getAuthBrand } from "@/lib/server/auth-brand";
import { requirePinnedOrganizationOrApex } from "@/lib/server/tenant";
import { AuthBrand } from "./auth-brand";

const highlights = [
  { icon: TimerIcon, title: "Log in seconds", text: "Live timers, start and end times, or total hours." },
  { icon: HandCoinsIcon, title: "Valued for grants", text: "Every hour priced at your volunteer rate." },
  { icon: BarChart3Icon, title: "Reports that travel", text: "Break down hours by project, person, and team." },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<AuthShellSkeleton />}>
      <AuthShell>{children}</AuthShell>
    </Suspense>
  );
}

async function AuthShell({ children }: { children: React.ReactNode }) {
  await requirePinnedOrganizationOrApex();
  const organization = await getAuthBrand();
  const css = brandCss(organization?.theme ?? clockedInTheme);

  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {organization?.isTenantHost ? <title>{organization.name}</title> : null}
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <aside className="brand-hero-navy relative hidden overflow-hidden px-10 py-12 text-white lg:flex lg:flex-col lg:px-12 lg:py-14">
        <div className="brand-rule absolute inset-x-0 top-0" />
        <AuthBrand organization={organization} surface="dark" />
        <div className="relative flex max-w-md flex-1 flex-col justify-center py-16">
          <h2 className="text-3xl font-semibold leading-snug tracking-tight">
            Every volunteer hour, counted and valued.
          </h2>
          <ul className="mt-10 flex flex-col gap-8">
            {highlights.map((item) => (
              <li key={item.title} className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <item.icon className="size-5 text-highlight" />
                </span>
                <span className="min-w-0 space-y-1.5 pt-0.5">
                  <span className="block font-medium">{item.title}</span>
                  <span className="block text-sm leading-relaxed text-white/70">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="relative flex flex-col items-center justify-center bg-muted px-4 py-12 sm:px-8">
        <div className="mb-10 lg:hidden">
          <AuthBrand organization={organization} surface="light" />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

function AuthShellSkeleton() {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="brand-hero-navy relative hidden overflow-hidden lg:block" />
      <main className="relative flex flex-col items-center justify-center bg-muted px-4 py-12 sm:px-8">
        <PageLoader />
      </main>
    </div>
  );
}
