"use client";

import cronstrue from "cronstrue";
import { useMemo } from "react";
import { Field } from "@/components/field";
import { SelectField, type Option } from "@/components/select-field";
import { Input } from "@/components/ui/input";
function looksLikeCron(value: string) {
  return /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/.test(value.trim());
}

const presets: Option[] = [
  { value: "__none__", label: "No schedule (manual / webhook only)" },
  { value: "0 * * * *", label: "Every hour" },
  { value: "0 */6 * * *", label: "Every 6 hours" },
  { value: "0 6 * * *", label: "Daily at 06:00 UTC" },
  { value: "0 6 * * 1", label: "Weekly on Monday at 06:00 UTC" },
  { value: "__custom__", label: "Custom…" },
];

type Props = {
  id: string;
  name: string;
  value: string | null;
  disabled?: boolean;
  onChange: (value: string | null) => void;
};

export function CronInput({ id, name, value, disabled, onChange }: Props) {
  const current = value?.trim() || "";
  const known = new Set(presets.map((item) => item.value).filter((item) => !item.startsWith("__")));
  const selectedPreset = !current ? "__none__" : known.has(current) ? current : "__custom__";
  const summary = useMemo(() => {
    if (!current) return "Pulls only when you click Pull or via webhook.";
    if (!looksLikeCron(current)) return "Enter a valid 5-field cron expression.";
    try {
      return cronstrue.toString(current, { use24HourTimeFormat: true });
    } catch {
      return "Enter a valid 5-field cron expression.";
    }
  }, [current]);

  return (
    <div className="flex flex-col gap-3">
      <Field label="Pull schedule" htmlFor={`${id}-preset`}>
        <SelectField
          id={`${id}-preset`}
          value={selectedPreset}
          options={presets}
          disabled={disabled}
          onValueChange={(next) => {
            if (next === "__none__") {
              onChange(null);
              return;
            }
            if (next === "__custom__") {
              onChange(current && !known.has(current) ? current : "0 * * * *");
              return;
            }
            onChange(next);
          }}
        />
      </Field>
      {selectedPreset === "__custom__" ? (
        <Field label="Cron expression" htmlFor={id} hint="minute hour day-of-month month day-of-week (UTC)">
          <Input
            id={id}
            name={name}
            value={current}
            disabled={disabled}
            placeholder="0 * * * *"
            onChange={(event) => onChange(event.target.value.trim() || null)}
          />
        </Field>
      ) : (
        <input type="hidden" name={name} value={current} />
      )}
      <p className="text-xs text-muted-foreground">{summary}</p>
    </div>
  );
}
