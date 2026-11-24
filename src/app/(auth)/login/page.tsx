import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buildPortalAuthorizeUrl } from "@/lib/api/features/external-auth";
import { portalSignInEnabled, readPreferences } from "@/lib/api/features/tenants";
import { appUrl } from "@/lib/api/security";
import { requirePinnedTenantOrApex } from "@/lib/server/tenant";
import { AuthCard, AuthFormSkeleton } from "../auth-card";
import { LoginForm } from "./login-form";
import { LoginExternalError } from "./login-external-error";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const pinned = await requirePinnedTenantOrApex();
  if (pinned.pinned && pinned.tenant) {
    const preferences = readPreferences(pinned.tenant.preferences);
    if (portalSignInEnabled(preferences)) {
      const redirectUri = appUrl("/auth/external/callback", pinned.slug);
      const { url } = await buildPortalAuthorizeUrl({
        tenantId: pinned.tenant.id,
        redirectUri,
        next: "/dashboard",
      });
      redirect(url);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to log and review volunteer hours."
      footer={
        <Suspense fallback={null}>
          <LoginFooter />
        </Suspense>
      }
    >
      <Suspense fallback={null}>
        <LoginExternalError />
      </Suspense>
      <Suspense fallback={<AuthFormSkeleton />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}

async function LoginFooter() {
  const pinned = await requirePinnedTenantOrApex();
  if (pinned.pinned) {
    return null;
  }

  return (
    <>
      New here?
      <Link href="/signup" className="font-medium">
        Create an account
      </Link>
    </>
  );
}
