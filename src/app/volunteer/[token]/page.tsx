import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageLoader } from "@/components/skeletons";
import { ApiError } from "@/lib/api/errors";
import { publicVolunteerNeed } from "@/lib/api/features/volunteer-needs";
import { getAccess } from "@/lib/server/session";
import { getTenantSlug } from "@/lib/server/tenant";
import { VolunteerSignup } from "./signup-form";

export const metadata: Metadata = { title: "Volunteer" };

export default function VolunteerNeedPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<VolunteerNeedSkeleton />}>
      <VolunteerNeed params={params} />
    </Suspense>
  );
}

async function VolunteerNeed({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let need: Awaited<ReturnType<typeof publicVolunteerNeed>>;
  try {
    need = await publicVolunteerNeed(token, { tenantSlug: await getTenantSlug() });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const access = await getAccess();
  const profile = access?.caller.profile;
  const account = access
    ? {
        name: profile?.displayName?.trim() || `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || access.caller.username,
        email: access.caller.email,
      }
    : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 py-10">
      <div>
        <p className="text-sm text-muted-foreground">{need.tenantName}</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{need.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {need.type} · {need.remaining} of {need.countNeeded} spots left
        </p>
      </div>
      {need.description ? <p className="whitespace-pre-wrap text-sm">{need.description}</p> : null}
      <VolunteerSignup token={token} need={need} account={account} />
    </main>
  );
}

function VolunteerNeedSkeleton() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl items-center justify-center px-4 py-10">
      <PageLoader />
    </main>
  );
}
