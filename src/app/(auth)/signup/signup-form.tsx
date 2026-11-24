"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { signUpAction } from "@/app/actions/auth";
import { Field, FormMessage } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/types";

export function SignupForm({
  email,
  firstName,
  lastName,
  username,
}: {
  email?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
}) {
  const next = useSearchParams().get("next") ?? "/dashboard";
  const [result, action] = useActionState((previous: ActionResult | null, formData: FormData) => {
    formData.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
    return signUpAction(previous, formData);
  }, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName">
          <Input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            required
            defaultValue={firstName}
            readOnly={Boolean(firstName)}
            className={firstName ? "bg-muted" : undefined}
          />
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <Input
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            required
            defaultValue={lastName}
            readOnly={Boolean(lastName)}
            className={lastName ? "bg-muted" : undefined}
          />
        </Field>
      </div>
      <Field label="Username" htmlFor="username">
        <Input
          id="username"
          name="username"
          autoComplete="username"
          required
          defaultValue={username}
          readOnly={Boolean(username)}
          className={username ? "bg-muted" : undefined}
        />
      </Field>
      <Field
        label="Email"
        htmlFor="email"
        hint={email ? "This invitation was sent to this email." : undefined}
      >
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={email}
          readOnly={Boolean(email)}
          className={email ? "bg-muted" : undefined}
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <FormMessage result={result} />
      <SubmitButton className="w-full">Create account</SubmitButton>
    </form>
  );
}
