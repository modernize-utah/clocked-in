"use client";

import { useSearchParams } from "next/navigation";

export function LoginExternalError() {
  const error = useSearchParams().get("error");
  if (error !== "external_auth") {
    return null;
  }

  return (
    <p className="mb-4 text-sm text-destructive">External sign-in failed. Try again or contact an admin.</p>
  );
}
