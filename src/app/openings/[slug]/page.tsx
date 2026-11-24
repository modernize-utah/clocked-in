import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageLoader } from "@/components/skeletons";
import { ApiError } from "@/lib/api/errors";
import { listPublicNeeds } from "@/lib/api/features/volunteer-needs";
import { getTenantSlug } from "@/lib/server/tenant";

export const metadata: Metadata = { title: "Open volunteer needs" };

export default function PublicOpeningsPage({ params }: PageProps<"/openings/[slug]">) {
  return (
    <Suspense fallback={<PublicOpeningsSkeleton />}>
      <PublicOpenings params={params} />
    </Suspense>
  );
}

async function PublicOpenings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let catalog: Awaited<ReturnType<typeof listPublicNeeds>>;
  try {
    catalog = await listPublicNeeds(slug, { tenantSlug: await getTenantSlug() });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div>
        <p className="text-sm text-muted-foreground">Volunteer openings</p>
        <h1 className="text-3xl font-semibold">{catalog.tenantName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Anyone can browse these needs and send a sign-up request.</p>
      </div>
      {catalog.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no public openings right now.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {catalog.items.map((need) => (
            <li key={need.id} className="rounded-xl border p-4">
              <h2 className="text-lg font-medium">{need.name}</h2>
              {need.description ? <p className="mt-1 text-sm text-muted-foreground">{need.description}</p> : null}
              <p className="mt-2 text-sm">
                {need.remaining} of {need.countNeeded} spots open
              </p>
              <Link href={`/volunteer/${need.token}`} className="mt-3 inline-block text-sm font-medium">
                Sign up
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function PublicOpeningsSkeleton() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl items-center justify-center px-4 py-10">
      <PageLoader />
    </main>
  );
}
