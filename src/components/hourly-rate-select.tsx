"use client";

import { Field } from "@/components/field";
import { SelectField } from "@/components/select-field";
import { useLookups } from "@/hooks/use-lookups";
import { formatCurrency } from "@/lib/format";

export function defaultVolunteerRateId(rates: { id: string; isDefault: boolean; isArchived: boolean }[]) {
  return rates.find((rate) => rate.isDefault && !rate.isArchived)?.id ?? rates.find((rate) => rate.isDefault)?.id ?? "";
}

export function HourlyRateSelect({
  id,
  value,
  onValueChange,
  disabled,
  locked,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  locked?: boolean;
}) {
  const { lookups } = useLookups();
  const options = lookups.hourlyRates
    .filter((rate) => !rate.isArchived)
    .map((rate) => ({
      value: rate.id,
      label: `${rate.name} · ${formatCurrency(rate.perHourRate)}/h`,
    }));
  const selected = lookups.hourlyRates.find((rate) => rate.id === value);

  if (locked) {
    return (
      <Field label="Hourly rate" hint="Volunteer default. This cannot be changed.">
        <p className="flex h-11 items-center text-base">
          {selected ? `${selected.name} · ${formatCurrency(selected.perHourRate)}/h` : "Volunteer default"}
        </p>
      </Field>
    );
  }

  return (
    <Field label="Hourly rate">
      <SelectField
        id={id}
        value={value}
        onValueChange={onValueChange}
        options={options}
        disabled={disabled || options.length === 0}
      />
    </Field>
  );
}
