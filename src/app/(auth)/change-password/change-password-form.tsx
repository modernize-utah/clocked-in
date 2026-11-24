"use client";

import { useActionState } from "react";
import { signOut } from "@/lib/lookup-persistence";
import { changePasswordAction } from "@/app/actions/profile";
import { Field, FormMessage } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChangePasswordForm({ next }: { next: string }) {
  const [result, action] = useActionState(changePasswordAction, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Temporary password" htmlFor="currentPassword">
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field label="New password" htmlFor="password" hint="8 characters or more. Do not reuse the temporary password.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword">
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>
      <FormMessage result={result} />
      <SubmitButton className="w-full">Save and continue</SubmitButton>
      <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()}>
        Sign out
      </Button>
    </form>
  );
}
