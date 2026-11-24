import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, AuthFormSkeleton } from "../auth-card";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="We will email you a 6-digit code. Enter it with your new password."
      footer={
        <>
          Remembered it?
          <Link href="/login" className="font-medium">
            Back to sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={<AuthFormSkeleton fields={1} />}>
        <ResetForm />
      </Suspense>
    </AuthCard>
  );
}
