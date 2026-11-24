"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { confirmResetAction, requestResetAction } from "@/app/actions/auth";
import { Field, FormMessage } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export function ResetForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(params.get("code") ?? "");
  const [requested, requestAction] = useActionState(requestResetAction, null);
  const [confirmed, confirmAction] = useActionState(confirmResetAction, null);

  const [appliedRequest, setAppliedRequest] = useState(requested);
  if (requested !== appliedRequest) {
    setAppliedRequest(requested);
    if (requested?.ok) {
      setCode("");
    }
  }

  return (
    <div className='flex flex-col gap-6'>
      <form action={requestAction} className='flex flex-col gap-4'>
        <Field label='Email' htmlFor='email'>
          <Input
            id='email'
            name='email'
            type='email'
            autoComplete='email'
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <FormMessage result={requested} />
        <SubmitButton variant={requested?.ok ? "outline" : "default"} className='w-full'>
          {requested?.ok ? "Send another code" : "Email me a code"}
        </SubmitButton>
      </form>
      {requested?.ok || params.get("code") ? (
        <>
          <Separator />
          <form action={confirmAction} className='flex flex-col gap-4'>
            <input type='hidden' name='email' value={email} />
            <Field label='Code' htmlFor='code'>
              <Input
                id='code'
                name='code'
                required
                inputMode='numeric'
                autoComplete='one-time-code'
                className='font-mono tracking-[0.3em]'
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
            <Field label='New password' htmlFor='password'>
              <Input
                id='password'
                name='password'
                type='password'
                autoComplete='new-password'
                required
              />
            </Field>
            <FormMessage result={confirmed} />
            <SubmitButton className='w-full'>Set new password</SubmitButton>
          </form>
        </>
      ) : null}
    </div>
  );
}
