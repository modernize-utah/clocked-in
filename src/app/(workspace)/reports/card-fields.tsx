"use client";

import { Field } from "@/components/field";
import { iconLabel } from "@/components/icon-picker-dialog";
import { SelectField, type Option } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { chartTypeLabel, chartTypes, paletteTypeLabel, paletteTypes } from "@/lib/chart-palette";
import { formatPatterns, formatPresetLabel } from "@/lib/number-pattern";
import {
  chartValueKeys, entriesLimitMax,
  entriesScopes, listColumnKeys,
  listColumnLabel,
  listLimitMax,
  listSortDirs,
  listSortKeys, valueColors,
  valueFormats,
  type ReportCard, type ValueColor
} from "@/lib/report-layout";


export const presetIcons = ["clock", "hand-coins", "users", "list-checks"];

export const colorSwatches: Record<ValueColor, string> = {
  primary: "bg-primary",
  highlight: "bg-highlight",
  accent: "bg-brand-accent",
  success: "bg-success",
};

export function formatOptions(formats: readonly string[]) {
  return formats.map((value) => ({ value, label: formatPresetLabel(value as "number") }));
}

export function iconOptions(current: string | null): Option[] {
  const options: Option[] = [{ value: "none", label: "None" }];
  for (const name of presetIcons) options.push({ value: name, label: iconLabel(name), icon: name });
  if (current && !presetIcons.includes(current)) options.push({ value: current, label: iconLabel(current), icon: current });
  options.push({ value: "other", label: "Other" });
  return options;
}

export function CardFields({
  card,
  paths,
  onPatch,
  onPickIcon,
  onDelete,
}: {
  card: ReportCard;
  paths: readonly (readonly [string, string])[];
  onPatch: (change: Partial<ReportCard>) => void;
  onPickIcon: () => void;
  onDelete: () => void;
}) {
  if (card.kind === "entries") {
    return (
      <>
        <Field label="Title" htmlFor="card-title">
          <Input id="card-title" value={card.title} onChange={(event) => onPatch({ title: event.target.value })} />
        </Field>
        <Field label="Description" htmlFor="card-description">
          <Textarea id="card-description" value={card.description} onChange={(event) => onPatch({ description: event.target.value })} />
        </Field>
        <Field label="Scope" htmlFor="card-scope">
          <SelectField
            id="card-scope"
            value={card.scope}
            onValueChange={(scope) => {
              if (scope === "mine" || scope === "tenant") {
                onPatch({ scope, accessor: `entries.${scope}` } as Partial<ReportCard>);
              }
            }}
            options={entriesScopes.map((value) => ({
              value,
              label: value === "mine" ? "My entries" : "Tenant entries",
            }))}
          />
        </Field>
        <Field label="Limit" htmlFor="card-limit">
          <Input
            id="card-limit"
            type="number"
            min={1}
            max={entriesLimitMax}
            value={card.limit}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isInteger(next) && next >= 1 && next <= entriesLimitMax) {
                onPatch({ limit: next } as Partial<ReportCard>);
              }
            }}
          />
        </Field>
        <Button type="button" variant="destructive" onClick={onDelete}>
          Delete card
        </Button>
      </>
    );
  }

  return (
    <>
      <Field label="Title" htmlFor="card-title">
        <Input id="card-title" value={card.title} onChange={(event) => onPatch({ title: event.target.value })} />
      </Field>
      <Field label="Description" htmlFor="card-description">
        <Textarea id="card-description" value={card.description} onChange={(event) => onPatch({ description: event.target.value })} />
      </Field>
      <Field label="Data" htmlFor="card-accessor">
        <SelectField
          id="card-accessor"
          value={paths.some(([path]) => path === card.accessor) ? card.accessor : "custom"}
          onValueChange={(value) => {
            if (value !== "custom") onPatch({ accessor: value });
          }}
          options={[...paths.map(([value, label]) => ({ value, label })), { value: "custom", label: "Custom path" }]}
        />
        <Input aria-label="Data path" className="mt-2" value={card.accessor} onChange={(event) => onPatch({ accessor: event.target.value })} />
      </Field>
      <Field label="Format" htmlFor="card-format">
        <SelectField
          id="card-format"
          value={card.format}
          onValueChange={(format) => {
            if (format === "number" || format === "hours" || format === "currency") {
              onPatch({ format, pattern: formatPatterns[format] });
            }
          }}
          options={formatOptions(valueFormats)}
        />
      </Field>
      <Field label="Number format" htmlFor="card-pattern">
        <Input id="card-pattern" value={card.pattern ?? formatPatterns[card.format]} onChange={(event) => onPatch({ pattern: event.target.value })} />
      </Field>
      {card.kind === "value" ? (
        <>
          <Field label="Color" htmlFor="card-color">
            <SelectField
              id="card-color"
              value={card.color}
              onValueChange={(color) => onPatch({ color } as Partial<ReportCard>)}
              options={valueColors.map((value) => ({
                value,
                label: value.charAt(0).toUpperCase() + value.slice(1),
                swatch: colorSwatches[value],
              }))}
            />
          </Field>
          <Field label="Icon" htmlFor="card-icon">
            <SelectField
              id="card-icon"
              value={card.icon ?? "none"}
              onValueChange={(icon) => {
                if (icon === "other") {
                  onPickIcon();
                  return;
                }
                onPatch({ icon: icon === "none" ? null : icon });
              }}
              options={iconOptions(card.icon)}
            />
          </Field>
        </>
      ) : null}
      {card.kind === "chart" ? (
        <>
          <Field label="Chart type" htmlFor="card-chart">
            <SelectField
              id="card-chart"
              value={card.chartType}
              onValueChange={(chartType) => onPatch({ chartType } as Partial<ReportCard>)}
              options={chartTypes.map((value) => ({ value, label: chartTypeLabel(value) }))}
            />
          </Field>
          <Field label="Palette" htmlFor="card-palette">
            <SelectField
              id="card-palette"
              value={card.palette}
              onValueChange={(palette) => onPatch({ palette } as Partial<ReportCard>)}
              options={paletteTypes.map((value) => ({ value, label: paletteTypeLabel(value) }))}
            />
          </Field>
          <Field label="Value" htmlFor="card-value-key">
            <SelectField
              id="card-value-key"
              value={card.valueKey}
              onValueChange={(valueKey) => onPatch({ valueKey } as Partial<ReportCard>)}
              options={chartValueKeys.map((value) => ({ value, label: value === "inKind" ? "In-kind value" : "Hours" }))}
            />
          </Field>
        </>
      ) : null}
      {card.kind === "list" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Columns</legend>
          {listColumnKeys.map((column) => (
            <label key={column} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={card.visibleColumns.includes(column)}
                onCheckedChange={(checked) => {
                  const next = checked === true
                    ? [...card.visibleColumns, column]
                    : card.visibleColumns.filter((item) => item !== column);
                  onPatch({ visibleColumns: listColumnKeys.filter((item) => next.includes(item)) } as Partial<ReportCard>);
                }}
              />
              {listColumnLabel(column)}
            </label>
          ))}
        </fieldset>
      ) : null}
      {card.kind === "list" ? (
        <>
          <Field label="Sort by" htmlFor="card-sort-key">
            <SelectField
              id="card-sort-key"
              value={card.sortKey ?? (card.limit !== undefined ? "hours" : "api")}
              onValueChange={(sortKey) => {
                if (sortKey === "api") {
                  onPatch({ sortKey: undefined } as Partial<ReportCard>);
                  return;
                }
                if (listSortKeys.includes(sortKey as (typeof listSortKeys)[number])) {
                  onPatch({ sortKey } as Partial<ReportCard>);
                }
              }}
              options={[
                { value: "api", label: "API order" },
                ...listSortKeys.map((value) => ({
                  value,
                  label: value === "people" ? "People" : value === "inKind" ? "In-kind" : value.charAt(0).toUpperCase() + value.slice(1),
                })),
              ]}
            />
          </Field>
          <Field label="Direction" htmlFor="card-sort-dir">
            <SelectField
              id="card-sort-dir"
              value={card.sortDir ?? "desc"}
              onValueChange={(sortDir) => {
                if (listSortDirs.includes(sortDir as (typeof listSortDirs)[number])) {
                  onPatch({ sortDir } as Partial<ReportCard>);
                }
              }}
              options={listSortDirs.map((value) => ({ value, label: value === "asc" ? "Ascending" : "Descending" }))}
            />
          </Field>
          <Field label="Limit" htmlFor="card-list-limit">
            <Input
              id="card-list-limit"
              type="number"
              min={1}
              max={listLimitMax}
              placeholder="No limit"
              value={card.limit ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "") {
                  onPatch({ limit: undefined } as Partial<ReportCard>);
                  return;
                }
                const next = Number(raw);
                if (Number.isInteger(next) && next >= 1 && next <= listLimitMax) {
                  onPatch({ limit: next } as Partial<ReportCard>);
                }
              }}
            />
          </Field>
        </>
      ) : null}
      <Button type="button" variant="destructive" onClick={onDelete}>
        Delete card
      </Button>
    </>
  );
}
