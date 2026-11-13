"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useRef, useTransition } from "react";
import { acceptInviteAction, logOutStayOnAcceptAction } from "@/app/actions/auth";
import { Field, FormMessage } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { clearPersistedLookups } from "@/lib/lookup-persistence";

export function AcceptForm() {
  const codeFromUrl = useSearchParams().get("code") ?? "";
  const [result, action] = useActionState(acceptInviteAction, null);
  const codeRef = useRef<HTMLInputElement>(null);
  const [loggingOut, startLogout] = useTransition();
  const mismatch = result?.ok === false && result.reason === "email_mismatch";

  function logOut() {
    const code = codeRef.current?.value ?? codeFromUrl;
    startLogout(async () => {
      await clearPersistedLookups();
      await logOutStayOnAcceptAction(code);
    });
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Invite code" htmlFor="code">
        <Input
          ref={codeRef}
          id="code"
          name="code"
          key={codeFromUrl}
          defaultValue={codeFromUrl}
          required
          className="h-10 font-mono"
        />
      </Field>
      {mismatch ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 font-sans text-sm text-destructive">
          {result.error}{" "}
          <button
            type="button"
            onClick={logOut}
            disabled={loggingOut}
            className="font-medium underline underline-offset-2 disabled:opacity-60"
          >
            Log out
          </button>
        </p>
      ) : (
        <FormMessage result={result} />
      )}
      <SubmitButton className="h-10 w-full">Join organization</SubmitButton>
    </form>
  );
}
