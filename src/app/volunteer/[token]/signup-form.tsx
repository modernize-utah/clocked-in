"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signUpForNeedAction } from "@/app/actions/volunteer-needs";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionMutation } from "@/hooks/use-action-mutation";

type Choice = { id: string; label: string };
type Question = { id: string; prompt: string; kind: "single" | "multi"; choices: Choice[] };

export type PublicNeed = {
  name: string;
  description: string | null;
  type: string;
  countNeeded: number;
  countVetted: number;
  remaining: number;
  startDate: string | null;
  endDate: string | null;
  requiredBy: string | null;
  requireVetting: boolean;
  closed: "deadline" | "full" | null;
  questions: Question[];
  tenantName: string;
};

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function VolunteerSignup({
  token,
  need,
  account,
}: {
  token: string;
  need: PublicNeed;
  account: { name: string; email: string } | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [requestAccess, setRequestAccess] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const signup = useActionMutation((body: Record<string, unknown>) => signUpForNeedAction(token, body));

  useEffect(() => {
    if (!siteKey) return;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  const closed =
    need.closed === "deadline"
      ? "Sign-up for this need has closed."
      : need.closed === "full"
        ? "This need is already filled."
        : null;

  const signedUp = signup.data?.data;
  if (signedUp) {
    const vetted = signedUp.vetted;
    return (
      <p className="rounded-xl border bg-card p-4 text-sm">
        {vetted
          ? "You are signed up and a spot is saved for you."
          : "You are signed up. Someone will review your answers before a spot is saved."}
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const captcha = (event.currentTarget.elements.namedItem("cf-turnstile-response") as HTMLInputElement | null)?.value;
        signup.mutate({
          ...(account ? {} : { name, email, phone }),
          comment,
          acknowledged,
          requestAccess,
          captchaToken: captcha || null,
          answers: need.questions.map((question) => ({ questionId: question.id, choiceIds: answers[question.id] ?? [] })),
        });
      }}
    >
      {need.questions.map((question) => (
        <fieldset key={question.id} className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{question.prompt}</legend>
          {question.choices.map((choice) => {
            const selected = answers[question.id]?.includes(choice.id) ?? false;
            return (
              <label key={choice.id} className="flex items-center gap-2 text-sm">
                <input
                  type={question.kind === "single" ? "radio" : "checkbox"}
                  name={question.id}
                  checked={selected}
                  onChange={() => {
                    setAnswers((current) => {
                      const existing = current[question.id] ?? [];
                      const next =
                        question.kind === "single" ? [choice.id] : selected ? existing.filter((id) => id !== choice.id) : [...existing, choice.id];
                      return { ...current, [question.id]: next };
                    });
                  }}
                />
                {choice.label}
              </label>
            );
          })}
        </fieldset>
      ))}
      {account ? (
        <p className="text-sm">
          Signing up as {account.name} ({account.email}).
        </p>
      ) : (
        <>
          <Field label="Name" htmlFor="guest-name">
            <Input id="guest-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Email" htmlFor="guest-email">
            <Input id="guest-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </Field>
          <Field label="Phone" htmlFor="guest-phone">
            <Input id="guest-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
          </Field>
          <p className="text-sm">
            Already have an account?{" "}
            <Link href={`/login?next=${encodeURIComponent(`/volunteer/${token}`)}`} className="text-primary underline-offset-4 hover:underline">
              Log in to sign up
            </Link>
          </p>
        </>
      )}
      <Field label="Comment" htmlFor="guest-comment" hint="Optional.">
        <Textarea id="guest-comment" value={comment} onChange={(event) => setComment(event.target.value)} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={requestAccess} onCheckedChange={(checked) => setRequestAccess(checked === true)} />
        <span>Also request an account so I can log hours in VolunTime.</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={acknowledged} onCheckedChange={(checked) => setAcknowledged(checked === true)} required />
        <span>
          Emails about this need will be sent to the address you provide. You are not joining a mailing list, and your information will not be sold
          or used for anything else.
        </span>
      </label>
      {siteKey ? <div className="cf-turnstile" data-sitekey={siteKey} /> : null}
      {closed ? <p className="text-sm text-muted-foreground">{closed}</p> : null}
      {signup.error?.message.includes("Log in") ? (
        <p className="text-sm">
          <Link href={`/login?next=${encodeURIComponent(`/volunteer/${token}`)}`} className="text-primary underline-offset-4 hover:underline">
            Log in to sign up
          </Link>
        </p>
      ) : null}
      <SubmitButton className="self-start" pending={signup.isPending} disabled={Boolean(closed) || !acknowledged}>
        Sign up
      </SubmitButton>
    </form>
  );
}
