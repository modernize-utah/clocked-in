import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, AuthFormSkeleton } from "../auth-card";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Accept an invite" };

export default function AcceptPage() {
  return (
    <AuthCard
      title="Accept an invite"
      description="Enter the 6-digit code from your invitation email to join the tenant."
      footer={
        <Link href="/dashboard" className="font-medium">
          Go to dashboard
        </Link>
      }
    >
      <Suspense fallback={<AuthFormSkeleton fields={1} />}>
        <AcceptForm />
      </Suspense>
    </AuthCard>
  );
}
