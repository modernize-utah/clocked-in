import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { acceptCodeFromNext, invitationAccount } from "@/lib/api/features/invitations";
import { clientIp } from "@/lib/api/rate-limit";
import { portalName } from "@/lib/portal";
import { safeNext } from "@/lib/server/action";
import { requirePinnedOrganizationOrApex } from "@/lib/server/tenant";
import { AuthCard, AuthFormSkeleton } from "../auth-card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <Suspense
      fallback={
        <AuthCard title="Create your account" description="Start tracking hours for your organization in a minute.">
          <AuthFormSkeleton fields={5} />
        </AuthCard>
      }
    >
      <SignupContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignupContent({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  const [search, pinned] = await Promise.all([searchParams, requirePinnedOrganizationOrApex()]);
  const next = safeNext(typeof search.next === "string" ? search.next : "");
  const code = acceptCodeFromNext(next);
  const invite = code ? await invitationAccount(code, pinned.organization?.id, { ip: clientIp(await headers()) }) : null;
  if (invite?.userExists) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const invitedEmail = invite?.email;
  if (pinned.pinned && !invitedEmail) {
    redirect(next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
  }

  const signInHref = next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
  return (
    <AuthCard
      title="Create your account"
      description={
        invitedEmail
          ? `Create a ${portalName()} account for the email this invitation was sent to.`
          : "Start tracking hours for your organization in a minute."
      }
      footer={
        <>
          Already have an account?
          <Link href={signInHref} className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={<AuthFormSkeleton fields={5} />}>
        <SignupForm
          email={invitedEmail}
          firstName={invite?.firstName ?? undefined}
          lastName={invite?.lastName ?? undefined}
          username={invite?.username ?? undefined}
        />
      </Suspense>
    </AuthCard>
  );
}
