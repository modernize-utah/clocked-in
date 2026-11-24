"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  decideNeedAction,
  deleteNeedAction,
  deleteSignupAction,
  emailVolunteersAction,
  unvetSignupAction,
  vetSignupAction,
} from "@/app/actions/volunteer-needs";
import { NeedForm } from "@/app/(workspace)/needs/need-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EntityFormDialog } from "@/components/entity-forms/entity-form-dialog";
import { Field } from "@/components/field";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useClientRedirect } from "@/hooks/use-client-redirect";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { needStatusLabel, needStatusVariant } from "@/lib/need-status";
import { keys, needQuery, signupsQuery } from "@/lib/queries";
import type { VolunteerSignup } from "@/lib/types";

export function NeedDetail({ needId }: { needId: string }) {
  const router = useRouter();
  const tenant = useTenant();
  const { isAdmin, isCoordinator, permissions } = useWorkspace();
  const canManage = isAdmin || isCoordinator || permissions.includes("create_needs") || permissions.includes("approve_needs");
  useClientRedirect(!canManage, "/dashboard");
  const need = useQuery(needQuery(needId));
  const signups = useQuery(signupsQuery(needId));
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const invalidate = [keys.needs(tenant.id), keys.need(needId), keys.signups(needId)];
  const remove = useActionMutation(() => deleteNeedAction(needId), {
    invalidate: [keys.needs(tenant.id)],
    onSuccess: () => router.push("/needs"),
  });
  const vet = useActionMutation((signupId: string) => vetSignupAction(needId, signupId), { invalidate });
  const unvet = useActionMutation((signupId: string) => unvetSignupAction(needId, signupId), { invalidate });
  const drop = useActionMutation((signupId: string) => deleteSignupAction(needId, signupId), { invalidate });
  const email = useActionMutation(
    () => emailVolunteersAction(needId, { signupIds: selected, subject, body: message }),
    { invalidate, onSuccess: () => setSelected([]) },
  );

  const decide = useActionMutation((status: "published" | "rejected") => decideNeedAction(needId, status), { invalidate });
  if (!canManage || need.isPending || signups.isPending) return <PageSkeleton rows={8} />;
  if (!need.data) return <p className="text-sm text-muted-foreground">This need is not available.</p>;

  const item = need.data;
  const rows = signups.data?.items ?? [];
  const share = item.allowPublic ? `/volunteer/${item.publicToken}` : null;

  function toggle(id: string, on: boolean) {
    setSelected((current) => (on ? [...current, id] : current.filter((itemId) => itemId !== id)));
  }

  return (
    <>
      <PageHeader
        description={item.description || "No description."}
        actions={
          <div className="flex gap-2">
            {item.status === "pending_approval" && permissions.includes("approve_needs") ? (
              <>
                <Button type="button" onClick={() => decide.mutate("published")}>Publish</Button>
                <Button type="button" variant="outline" onClick={() => decide.mutate("rejected")}>Reject</Button>
              </>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </div>
        }
      />
      <h1 className="mb-1 font-heading text-2xl font-semibold">{item.name}</h1>
      <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant={needStatusVariant(item.status)}>{needStatusLabel(item.status)}</Badge>
        <span>
          {item.type} · {item.countVetted} of {item.countNeeded} vetted · {item.requireVetting ? "Vetting required" : "Correct answers are vetted automatically"}
        </span>
      </p>
      {share ? (
        <p className="mb-6 text-sm">
          Public link:{" "}
          <Link href={share} className="text-primary underline-offset-4 hover:underline">
            {share}
          </Link>
        </p>
      ) : (
        <p className="mb-6 text-sm text-muted-foreground">This need is not public.</p>
      )}
      <section className="mb-8 flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Volunteers</h2>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nobody has signed up yet.</p> : null}
        <ul className="flex flex-col gap-3">
          {rows.map((signup) => (
            <SignupCard
              key={signup.id}
              signup={signup}
              selected={selected.includes(signup.id)}
              onSelected={(on) => toggle(signup.id, on)}
              onVet={() => (signup.vetted ? unvet.mutate(signup.id) : vet.mutate(signup.id))}
              onRemove={() => drop.mutate(signup.id)}
            />
          ))}
        </ul>
      </section>
      <form
        className="flex max-w-xl flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          email.mutate();
        }}
      >
        <h2 className="font-heading text-lg font-semibold">Email selected volunteers</h2>
        <Field label="Subject" htmlFor="email-subject">
          <Input id="email-subject" value={subject} onChange={(event) => setSubject(event.target.value)} required />
        </Field>
        <Field label="Message" htmlFor="email-body">
          <Textarea id="email-body" value={message} onChange={(event) => setMessage(event.target.value)} required />
        </Field>
        <SubmitButton className="self-start" pending={email.isPending} disabled={selected.length === 0}>
          Send to {selected.length || "none"}
        </SubmitButton>
      </form>
      <EntityFormDialog open={editing} onOpenChange={setEditing} title="Edit need" className="sm:max-w-2xl">
        <NeedForm need={item} onDone={() => setEditing(false)} />
      </EntityFormDialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this need?"
        description="Signups for this need are removed. Guest records stay."
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

function SignupCard({
  signup,
  selected,
  onSelected,
  onVet,
  onRemove,
}: {
  signup: VolunteerSignup;
  selected: boolean;
  onSelected: (on: boolean) => void;
  onVet: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <label className="flex items-start gap-2">
          <Checkbox checked={selected} onCheckedChange={(checked) => onSelected(checked === true)} aria-label={`Select ${signup.name}`} />
          <span>
            <span className="block font-medium">{signup.name}</span>
            <span className="block text-sm text-muted-foreground">
              {signup.email}
              {signup.phone ? ` · ${signup.phone}` : ""} · {signup.kind === "guest" ? "Guest" : "Member"}
              {signup.linkedUserId ? " · linked to a member" : ""}
            </span>
          </span>
        </label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onVet}>
            {signup.vetted ? "Remove vetting" : "Vet"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
      <p className="mt-3 text-sm">
        {signup.passed ? "Answers matched." : "Answers did not match."} {signup.vetted ? "Vetted." : "Not vetted."}
      </p>
      {signup.comment ? <p className="mt-2 text-sm whitespace-pre-wrap">{signup.comment}</p> : null}
      {signup.answers.length ? (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {signup.answers.map((answer) => (
            <li key={answer.questionId}>
              <span className="text-muted-foreground">{answer.prompt}</span> {answer.labels.join(", ")}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
