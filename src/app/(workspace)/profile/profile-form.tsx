"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { changePasswordAction, updateProfileAction } from "@/app/actions/profile";
import { AvatarField } from "@/components/avatar-field";
import { Field, FormMessage } from "@/components/field";
import { SectionLayout } from "@/components/section-layout";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Textarea } from "@/components/ui/textarea";
import { requestAccessAction } from "@/app/actions/access-requests";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useLookups } from "@/hooks/use-lookups";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { keys } from "@/lib/queries";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectField } from "@/components/select-field";
import { SearchableSelect } from "@/components/searchable-select";
import { ProfileNav, type ProfileSection } from "./profile-nav";

function timezoneChoices(current: string) {
  const rest = Intl.supportedValuesOf("timeZone")
    .filter((zone) => zone !== "UTC" && zone !== current)
    .sort((a, b) => a.localeCompare(b));
  return current === "UTC" ? ["UTC", ...rest] : [current, "UTC", ...rest];
}

export type EditableProfile = {
  id: string;
  username: string;
  email: string;
  profile: {
    firstName: string;
    lastName: string;
    displayName: string | null;
    timezone: string;
    phone: string | null;
    zipCode: string | null;
    notes: string | null;
    avatarUrl: string | null;
    description: string | null;
  };
};

type SaveStatus = {
  result: { ok: boolean; error?: string; message?: string } | null;
  pending: boolean;
};

export function ProfileForm({ user }: { user: EditableProfile }) {
  const [section, setSection] = useState<ProfileSection>("about");
  const [profileStatus, setProfileStatus] = useState<SaveStatus>({ result: null, pending: false });
  const [passwordStatus, setPasswordStatus] = useState<SaveStatus>({ result: null, pending: false });
  const status = section === "password" ? passwordStatus : profileStatus;

  return (
    <SectionLayout
      scrollKey={section}
      nav={<ProfileNav section={section} onSection={setSection} />}
      footer={
        <div
          role='group'
          aria-label={section === "password" ? "Password actions" : "Profile actions"}
          className='flex flex-col gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10 sm:flex-row sm:items-center'
        >
          <SaveBar result={status.result}>
            {section === "password" ? (
              <SubmitButton form='password-form' pending={status.pending} className='h-9 w-full sm:ml-auto sm:w-auto'>
                Update password
              </SubmitButton>
            ) : (
              <SubmitButton form='profile-form' pending={status.pending} className='h-9 w-full sm:ml-auto sm:w-auto'>
                Save profile
              </SubmitButton>
            )}
          </SaveBar>
        </div>
      }
    >
      <div className={section === "about" ? undefined : "hidden"}>
        <AboutForm user={user} onStatus={setProfileStatus} />
        <RequestAccessCard />
      </div>
      <div className={section === "password" ? undefined : "hidden"}>
        <PasswordForm onStatus={setPasswordStatus} />
      </div>
    </SectionLayout>
  );
}

function FieldGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className='grid gap-4 border-t pt-6 first:border-t-0 first:pt-0 sm:grid-cols-2'>
      <div className='sm:col-span-2'>
        <h3 className='font-heading text-sm font-medium'>{title}</h3>
        {hint ? <p className='mt-1 text-sm text-muted-foreground'>{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SaveBar({
  result,
  children,
}: {
  result: { ok: boolean; error?: string; message?: string } | null;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className='min-w-0 flex-1'>
        <FormMessage result={result} />
      </div>
      {children}
    </>
  );
}

function AboutForm({ user, onStatus }: { user: EditableProfile; onStatus: (status: SaveStatus) => void }) {
  const queryClient = useQueryClient();
  const [result, action, pending] = useActionState(updateProfileAction, null);
  const profile = user.profile;
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "");
  const [appliedResult, setAppliedResult] = useState(result);
  const zones = timezoneChoices(profile.timezone || "UTC");
  const [timezone, setTimezone] = useState(profile.timezone || "UTC");
  if (result !== appliedResult) {
    setAppliedResult(result);
    if (result?.ok && typeof result.data === "string") {
      setAvatarUrl(result.data);
    }
  }

  useEffect(() => {
    if (!result?.ok) return;
    void queryClient.invalidateQueries({ queryKey: keys.me() });
    void queryClient.invalidateQueries({ queryKey: keys.user(user.id) });
  }, [queryClient, result, user.id]);

  useEffect(() => {
    onStatus({ result, pending });
  }, [onStatus, pending, result]);

  return (
    <form id='profile-form' action={action}>
      <Card>
        <CardHeader>
          <CardTitle>About you</CardTitle>
          <CardDescription>Name, contact, and sign-in are saved together.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-6'>
          <FieldGroup title='Name'>
            <AvatarField userId={user.id} value={avatarUrl} onChange={setAvatarUrl} />
            <Field label='First name' htmlFor='firstName'>
              <Input
                id='firstName'
                name='firstName'
                autoComplete='given-name'
                required
                maxLength={100}
                defaultValue={profile.firstName}
                className='h-9'
              />
            </Field>
            <Field label='Last name' htmlFor='lastName'>
              <Input
                id='lastName'
                name='lastName'
                autoComplete='family-name'
                required
                maxLength={100}
                defaultValue={profile.lastName}
                className='h-9'
              />
            </Field>
            <Field
              label='Display name'
              htmlFor='displayName'
              hint='Leave blank to use your first and last name.'
              className='sm:col-span-2'
            >
              <Input
                id='displayName'
                name='displayName'
                autoComplete='nickname'
                maxLength={100}
                defaultValue={profile.displayName ?? ""}
                className='h-9'
              />
            </Field>
            <Field label='Description' htmlFor='description' hint='Shown on your profile.' className='sm:col-span-2'>
              <MarkdownEditor
                id='description'
                name='description'
                label='Description'
                maxLength={8000}
                defaultValue={profile.description ?? ""}
              />
            </Field>
          </FieldGroup>

          <FieldGroup title='Contact' hint='Phone, ZIP, and notes stay on your profile.'>
            <Field label='Timezone' htmlFor='timezone' hint='Punch dates use this timezone.'>
              <input type='hidden' name='timezone' value={timezone} />
              <SearchableSelect
                id='timezone'
                value={timezone}
                onValueChange={(next) => setTimezone(next || timezone)}
                options={zones.map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }))}
                searchPlaceholder='Search timezones'
                className='h-9'
              />
            </Field>
            <Field label='Phone' htmlFor='phone'>
              <Input
                id='phone'
                name='phone'
                type='tel'
                autoComplete='tel'
                maxLength={40}
                defaultValue={profile.phone ?? ""}
                className='h-9'
              />
            </Field>
            <Field label='Zip code' htmlFor='zipCode' hint='Shown on volunteer workbooks.'>
              <Input
                id='zipCode'
                name='zipCode'
                autoComplete='postal-code'
                maxLength={20}
                defaultValue={profile.zipCode ?? ""}
                className='h-9'
              />
            </Field>
            <Field
              label='Notes'
              htmlFor='notes'
              hint='Visible to you and tenant admins.'
              className='sm:col-span-2'
            >
              <Textarea
                id='notes'
                name='notes'
                maxLength={2000}
                defaultValue={profile.notes ?? ""}
                className='min-h-24'
              />
            </Field>
          </FieldGroup>

          <FieldGroup title='Sign-in' hint='Username is how you sign in. Invite and password codes go to this email.'>
            <Field label='Username' htmlFor='username' hint='Letters, numbers, dots, underscores, or hyphens.'>
              <Input
                id='username'
                name='username'
                autoComplete='username'
                required
                minLength={3}
                maxLength={50}
                defaultValue={user.username}
                className='h-9'
              />
            </Field>
            <Field label='Email' htmlFor='email'>
              <Input
                id='email'
                name='email'
                type='email'
                autoComplete='email'
                required
                maxLength={254}
                defaultValue={user.email}
                className='h-9'
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </form>
  );
}

function PasswordForm({ onStatus }: { onStatus: (status: SaveStatus) => void }) {
  const [result, submit, pending] = useActionState(changePasswordAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (result?.ok) formRef.current?.reset();
  }, [result]);

  useEffect(() => {
    onStatus({ result, pending });
  }, [onStatus, pending, result]);

  return (
    <form
      id='password-form'
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => {
          submit(data);
        });
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>A new password signs out every other device. This browser stays signed in.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2'>
          <Field label='Current password' htmlFor='currentPassword' className='sm:col-span-2'>
            <Input
              id='currentPassword'
              name='currentPassword'
              type='password'
              autoComplete='current-password'
              required
              className='h-9'
            />
          </Field>
          <Field label='New password' htmlFor='password' hint='8 characters or more.'>
            <Input id='password' name='password' type='password' autoComplete='new-password' required className='h-9' />
          </Field>
          <Field label='Confirm new password' htmlFor='confirmPassword'>
            <Input
              id='confirmPassword'
              name='confirmPassword'
              type='password'
              autoComplete='new-password'
              required
              className='h-9'
            />
          </Field>
        </CardContent>
      </Card>
    </form>
  );
}

function RequestAccessCard() {
  const tenant = useTenant();
  const { isAdmin, isCoordinator } = useWorkspace();
  const { lookups } = useLookups();
  const [message, setMessage] = useState("");
  const [requestedRole, setRequestedRole] = useState("GROUP_MANAGER");
  const [organizationIds, setOrganizationIds] = useState<string[]>([]);
  const request = useActionMutation(() =>
    requestAccessAction(tenant.id, {
      message,
      requestedRole,
      requestedOrganizationIds: requestedRole === "GROUP_MANAGER" ? organizationIds : [],
    }),
  );
  if (isAdmin || isCoordinator) return null;
  return (
    <Card className='mt-6'>
      <CardHeader>
        <CardTitle>Request more access</CardTitle>
        <CardDescription>Ask an admin for group manager or admin access.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <Field label='Access'>
          <SelectField
            value={requestedRole}
            onValueChange={setRequestedRole}
            options={[
              { value: "GROUP_MANAGER", label: "Group manager" },
              { value: "ADMIN", label: "Admin" },
            ]}
            className='h-9'
          />
        </Field>
        {requestedRole === "GROUP_MANAGER" && lookups.organizations.length > 0 ? (
          <div className='grid gap-2'>
            <p className='text-sm font-medium'>Groups</p>
            {lookups.organizations.map((organization) => (
              <label key={organization.id} className='flex items-center gap-2 text-sm'>
                <Checkbox
                  checked={organizationIds.includes(organization.id)}
                  onCheckedChange={(next) => {
                    setOrganizationIds((current) =>
                      next === true ? [...current, organization.id] : current.filter((id) => id !== organization.id),
                    );
                  }}
                />
                {organization.name}
              </label>
            ))}
          </div>
        ) : null}
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder='Why do you need more access?'
        />
        <SubmitButton pending={request.isPending} onClick={() => request.mutate()}>
          Send request
        </SubmitButton>
      </CardContent>
    </Card>
  );
}
