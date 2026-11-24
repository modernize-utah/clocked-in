"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { logInAction } from "@/app/actions/auth";
import { Field, FormMessage } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const next = useSearchParams().get("next") ?? "/dashboard";
  const [result, action] = useActionState(logInAction, null);

  return (
    <form action={action} className="mt-1 flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <Field label="Username" htmlFor="username">
        <Input id="username" name="username" autoComplete="username" required />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        action={
          <Link href="/forgot-password" className="text-sm">
            Forgot password?
          </Link>
        }
      >
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage result={result} />
      <SubmitButton className="mt-1 w-full">Sign in</SubmitButton>
    </form>
  );
}
