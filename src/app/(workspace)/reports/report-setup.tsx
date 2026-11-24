"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Field } from "@/components/field";
import { PageHeader } from "@/components/page-header";
import { SelectField } from "@/components/select-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useLabels } from "@/hooks/use-labels";
import { useTenant } from "@/hooks/use-workspace";
import type { ReportTemplate } from "@/lib/api/features/report-templates";
import { createReportAction } from "@/app/actions/reports";
import { reportTemplatesQuery } from "@/lib/queries";
import {
  emptyLayout,
  builtinTemplateIds,
  filtersFromSearch,
  reportTemplate,
  reportTemplateIds,
  reportTemplateLabel,
} from "@/lib/report-layout";
import { slugForSavedReport } from "@/lib/report-slug";
import { cn } from "cn";

export function builtinTemplates(copy: {
  organization: string;
  taskCategory: string;
  project: string;
}): ReportTemplate[] {
  return reportTemplateIds.map((id) => ({
    id: builtinTemplateIds[id],
    tenantId: null,
    key: id,
    name: reportTemplateLabel(id),
    layout: reportTemplate(id, copy),
    baseTemplateId: null,
    scope: "global",
    createdAt: "",
    updatedAt: "",
  }));
}

export function useTemplateChoices() {
  const tenant = useTenant();
  const { organization, taskCategory, project } = useLabels();
  const builtin = useMemo(
    () => builtinTemplates({ organization, taskCategory, project }),
    [organization, taskCategory, project],
  );
  const templates = useQuery({
    ...reportTemplatesQuery(tenant.id),
    placeholderData: builtin,
  });
  return { tenant, templates, choices: templates.data?.length ? templates.data : builtin };
}

export function ReportSetup() {
  const router = useRouter();
  const search = useSearchParams();
  const { tenant, choices } = useTemplateChoices();
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [startFrom, setStartFrom] = useState(() => search.get("startFrom") ?? "blank");
  const [error, setError] = useState<string | null>(null);
  const matchedStart = choices.find((item) => item.id === startFrom || item.key === startFrom);

  const save = useMutation({
    mutationFn: async () => {
      const chosen = choices.find((item) => item.id === startFrom) ?? matchedStart;
      const result = await createReportAction(tenant.id, {
        name,
        isDefault,
        layout: chosen?.layout ?? emptyLayout(),
        filters: filtersFromSearch(search),
      });
      if (!result.ok || !result.data) {
        throw new Error(result.ok ? "The report could not be saved." : result.error);
      }
      return result.data;
    },
    onSuccess: (saved) => router.replace(`/reports/${slugForSavedReport(saved.name)}/design`),
    onError: (caught) => setError(caught instanceof Error ? caught.message : "The report could not be saved."),
  });

  return (
    <div className='mx-auto flex w-full max-w-lg flex-col gap-4'>
      <PageHeader />
      <form
        className='flex flex-col gap-4'
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        <Field label='Name' htmlFor='report-name'>
          <Input
            id='report-name'
            value={name}
            maxLength={80}
            placeholder='Report name'
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <label className='flex items-center gap-2 text-sm'>
          <Checkbox checked={isDefault} onCheckedChange={(checked) => setIsDefault(checked === true)} />
          Default report
        </label>
        <Field label='Start from' htmlFor='report-start'>
          <SelectField
            id='report-start'
            value={matchedStart?.id ?? "blank"}
            onValueChange={setStartFrom}
            options={[
              { value: "blank", label: "Blank" },
              ...choices.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
        </Field>
        {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        <div className='flex items-center gap-2'>
          <Link href='/reports' className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
            Cancel
          </Link>
          <Button type='submit' size='lg' disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}
