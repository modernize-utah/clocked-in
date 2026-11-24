"use client";

import { useState } from "react";
import { createHourlyRateAction, deleteHourlyRateAction, updateHourlyRateAction } from "@/app/actions/hourly-rates";
import { Field } from "@/components/field";
import { SelectField } from "@/components/select-field";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useLookups } from "@/hooks/use-lookups";
import { useTenant } from "@/hooks/use-workspace";
import { formatCurrency } from "@/lib/format";
import { keys } from "@/lib/queries";
import type { HourlyRate } from "@/lib/types";

const types = [
  { value: "Volunteer", label: "Volunteer" },
  { value: "Professional", label: "Professional" },
  { value: "Paid", label: "Paid" },
];

export function HourlyRatesCard() {
  const tenant = useTenant();
  const { lookups } = useLookups();
  const invalidate = [keys.lookups(tenant.id), keys.tenant(tenant.id)];
  const [name, setName] = useState("");
  const [type, setType] = useState("Volunteer");
  const [perHourRate, setPerHourRate] = useState("35.47");
  const [source, setSource] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const create = useActionMutation(
    () =>
      createHourlyRateAction(tenant.id, {
        type,
        name,
        perHourRate: Number(perHourRate),
        isDefault: type === "Volunteer" && isDefault,
        source: source.trim() || null,
      }),
    {
      invalidate,
      onSuccess: () => {
        setName("");
        setSource("");
        setIsDefault(false);
      },
    },
  );
  const update = useActionMutation(
    ({
      rateId,
      patch,
    }: {
      rateId: string;
      patch: { isDefault?: boolean; isArchived?: boolean; source?: string | null };
    }) => updateHourlyRateAction(rateId, patch),
    { invalidate },
  );
  const remove = useActionMutation((rateId: string) => deleteHourlyRateAction(rateId), { invalidate });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hourly rates</CardTitle>
        <CardDescription>
          Each tenant needs one default volunteer rate. Archived rates stay here but cannot be selected on new
          entries.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-5'>
        <form
          className='grid grid-cols-2 gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_auto]'
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Field label='Name' htmlFor='rate-name' className='col-span-2 sm:col-span-1'>
            <Input
              id='rate-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className='h-9'
            />
          </Field>
          <Field label='Type'>
            <SelectField
              value={type}
              onValueChange={(next) => {
                setType(next);
                if (next !== "Volunteer") setIsDefault(false);
              }}
              options={types}
              className='h-9'
            />
          </Field>
          <Field label='Per hour' htmlFor='rate-amount'>
            <Input
              id='rate-amount'
              type='number'
              min='0.01'
              step='0.01'
              value={perHourRate}
              onChange={(event) => setPerHourRate(event.target.value)}
              required
              className='h-9'
            />
          </Field>
          <Field
            label='Source'
            htmlFor='rate-source'
            hint='Optional. Where this amount comes from.'
            className='col-span-2 sm:col-span-4'
          >
            <Input
              id='rate-source'
              value={source}
              onChange={(event) => setSource(event.target.value)}
              maxLength={200}
              placeholder='Independent Sector'
              className='h-9'
            />
          </Field>
          {type === "Volunteer" ? (
            <label className='col-span-2 flex items-center gap-2 text-sm sm:col-span-4'>
              <Checkbox checked={isDefault} onCheckedChange={(checked) => setIsDefault(checked === true)} />
              Make this the default volunteer rate
            </label>
          ) : null}
          <SubmitButton
            pending={create.isPending}
            className='col-span-2 h-9 sm:col-span-1 sm:col-start-4 sm:row-start-1 sm:mt-6'
          >
            Add rate
          </SubmitButton>
        </form>
        <ul className='divide-y rounded-lg border'>
          {lookups.hourlyRates.map((rate) => (
            <RateRow
              key={rate.id}
              rate={rate}
              pending={update.isPending || remove.isPending}
              onDefault={() => update.mutate({ rateId: rate.id, patch: { isDefault: true } })}
              onArchive={() => update.mutate({ rateId: rate.id, patch: { isArchived: !rate.isArchived } })}
              onSource={(next) => update.mutate({ rateId: rate.id, patch: { source: next } })}
              onDelete={() => remove.mutate(rate.id)}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RateRow({
  rate,
  pending,
  onDefault,
  onArchive,
  onSource,
  onDelete,
}: {
  rate: HourlyRate;
  pending: boolean;
  onDefault: () => void;
  onArchive: () => void;
  onSource: (source: string | null) => void;
  onDelete: () => void;
}) {
  return (
    <li className='flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5'>
      <div className='w-full min-w-0 sm:w-auto sm:min-w-40 sm:flex-1'>
        <p className='break-words text-sm font-medium sm:truncate'>{rate.name}</p>
        <p className='truncate text-xs text-muted-foreground'>
          {rate.type} · {formatCurrency(rate.perHourRate)}/h
        </p>
      </div>
      <SourceField rate={rate} pending={pending} onSource={onSource} />
      {rate.isDefault ? <Badge>Default</Badge> : null}
      {rate.isArchived ? <Badge variant='outline'>Archived</Badge> : null}
      {rate.type === "Volunteer" && !rate.isDefault ? (
        <Button type='button' variant='ghost' size='sm' disabled={pending} onClick={onDefault}>
          Make default
        </Button>
      ) : null}
      <Button type='button' variant='ghost' size='sm' disabled={pending || rate.isDefault} onClick={onArchive}>
        {rate.isArchived ? "Unarchive" : "Archive"}
      </Button>
      {rate.isDefault ? null : (
        <Button type='button' variant='ghost' size='sm' disabled={pending} onClick={onDelete}>
          Delete
        </Button>
      )}
    </li>
  );
}

function SourceField({
  rate,
  pending,
  onSource,
}: {
  rate: HourlyRate;
  pending: boolean;
  onSource: (source: string | null) => void;
}) {
  const saved = rate.source ?? "";
  const [value, setValue] = useState(saved);
  const [previousSaved, setPreviousSaved] = useState(saved);
  if (saved !== previousSaved) {
    setPreviousSaved(saved);
    setValue(saved);
  }

  return (
    <Input
      value={value}
      aria-label={`Source for ${rate.name}`}
      placeholder='Source'
      maxLength={200}
      disabled={pending}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        const next = value.trim();
        if (next === saved) {
          setValue(saved);
          return;
        }

        onSource(next || null);
      }}
      className='h-8 w-full text-sm sm:w-56'
    />
  );
}
