"use client";

import { useMemo, useState } from "react";
import { CheckIcon } from "lucide-react";
import { importPeopleAction, importProjectsAction } from "@/app/actions/imports";
import { defaultReviewAction, peopleRowMatch, type ReviewAction } from "@/lib/import/people-review";
import { usernameFromName } from "@/lib/import/username";
import { useMembers } from "@/hooks/use-members";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useLabels } from "@/hooks/use-labels";
import { useOrganization } from "@/hooks/use-workspace";
import type { ImportResult } from "@/lib/api/features/imports";
import { type ImportEntity, type ImportField, fieldsFor } from "@/lib/import/fields";
import { maxImportRows, parseCsv } from "@/lib/import/parse-csv";
import { applyMapping, fieldChoices, missingRequired, reconcile, type ColumnAssignment } from "@/lib/import/reconcile";
import { keys } from "@/lib/queries";

const entities: { id: Exclude<ImportEntity, "departments">; label: (copy: { projects: string }) => string }[] = [
  { id: "people", label: () => "People" },
  { id: "projects", label: (copy) => copy.projects },
];

function requiredMessage(missing: ImportField[]) {
  const labels = missing.map((field) => field.label);
  if (labels.length === 1) {
    return `Assign ${labels[0]} before importing.`;
  }

  if (labels.length === 2) {
    return `Assign ${labels[0]} and ${labels[1]} before importing.`;
  }

  return `Assign ${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)} before importing.`;
}

export function ImportView() {
  const organization = useOrganization();
  const copy = useLabels();
  const [entity, setEntity] = useState<Exclude<ImportEntity, "departments">>("people");
  const [emailUsers, setEmailUsers] = useState(false);
  const [reviewActions, setReviewActions] = useState<Record<string, ReviewAction>>({});
  const { members } = useMembers();
  const [hasHeaders, setHasHeaders] = useState(true);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [overrides, setOverrides] = useState<Record<number, string | null>>({});
  const [result, setResult] = useState<ImportResult | null>(null);

  const fields = useMemo(() => fieldsFor(entity, copy.department), [entity, copy.department]);
  const headerRow = hasHeaders ? (rows?.[0] ?? null) : null;
  const data = rows ? (hasHeaders ? rows.slice(1) : rows) : [];
  const width = Math.max(headerRow?.length ?? 0, ...data.map((row) => row.length), 0);
  const samples = data.slice(0, 5).map((row) => {
    const padded = row.slice();
    while (padded.length < width) {
      padded.push("");
    }
    return padded;
  });
  const auto = rows ? reconcile(fields, headerRow, samples) : [];
  const assignments = auto.map((column) =>
    Object.prototype.hasOwnProperty.call(overrides, column.column)
      ? { column: column.column, field: overrides[column.column] ?? null, confident: false }
      : column,
  );
  const missing = missingRequired(fields, assignments);
  const tooMany = data.length > maxImportRows;
  const preview = data.slice(0, 5);

  const importRows = useActionMutation(
    (input: Record<string, string>[]) => {
      if (entity === "people") {
        return importPeopleAction(organization.id, input, emailUsers);
      }

      return importProjectsAction(organization.id, input);
    },
    {
      silent: true,
      invalidate: [keys.members(organization.id), keys.lookups(organization.id)],
      onSuccess: (imported) => setResult(imported ?? null),
    },
  );

  function resetFile() {
    setRows(null);
    setFileName("");
    setParseError(null);
    setOverrides({});
    setResult(null);
    setFileKey((key) => key + 1);
  }

  function chooseEntity(next: Exclude<ImportEntity, "departments">) {
    setEntity(next);
    resetFile();
  }

  async function loadFile(file: File) {
    setResult(null);
    setOverrides({});
    setParseError(null);
    setFileName(file.name);
    try {
      setRows(parseCsv(await file.text()));
    } catch (error) {
      setRows(null);
      setParseError(error instanceof Error ? error.message : "Could not read that CSV.");
    }
  }

  function setColumn(column: number, field: string | null) {
    setResult(null);
    setOverrides((current) => {
      const next = { ...current };
      const match = auto.find((item) => item.column === column);
      if ((match?.field ?? null) === field) {
        delete next[column];
      } else {
        next[column] = field;
      }
      return next;
    });
  }

  const canImport = Boolean(rows) && data.length > 0 && !tooMany && missing.length === 0 && !parseError && !importRows.isPending;

  return (
    <Tabs
      value={entity}
      onValueChange={(next) => chooseEntity(next === "projects" ? "projects" : "people")}
    >
      <TabsList variant="line">
        {entities.map((item) => (
          <TabsTrigger key={item.id} value={item.id}>
            {item.label(copy)}
          </TabsTrigger>
        ))}
      </TabsList>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Import {entity === "people" ? "people" : copy.projects.toLowerCase()}</CardTitle>
          <CardDescription>
            Import creates accounts. It does not send invitations. Existing emails are skipped. Check Email users to send
            welcome credentials. Add {copy.departments.toLowerCase()} one at a time on the {copy.departments} screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <a
              className="text-sm underline-offset-2 hover:underline"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(fields.map((field) => field.label).join(","))}`}
              download={`${entity}-template.csv`}
            >
              Download template
            </a>
          </div>
          {entity === "people" ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={emailUsers} onCheckedChange={(checked) => setEmailUsers(checked === true)} />
              Email users welcome credentials after import
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={hasHeaders}
              onCheckedChange={(checked) => {
                setHasHeaders(checked === true);
                setOverrides({});
                setResult(null);
              }}
            />
            First row is column headers
          </label>
          <Input
            key={`${entity}-${fileKey}`}
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            className="h-9"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void loadFile(file);
              }
            }}
          />
          {fileName ? <p className="text-xs text-muted-foreground">{fileName}</p> : null}
          {parseError ? (
            <p role="alert" className="text-sm text-destructive">
              {parseError}
            </p>
          ) : null}
          {tooMany ? (
            <p role="alert" className="text-sm text-destructive">
              A CSV import can include at most 1000 rows.
            </p>
          ) : null}
          {rows && data.length === 0 && !parseError ? (
            <p className="text-sm text-muted-foreground">This file has no data rows.</p>
          ) : null}
          {rows && preview.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Showing the first {preview.length} of {data.length} {data.length === 1 ? "row" : "rows"}.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    {assignments.map((column) => (
                      <TableHead key={column.column} className="h-auto align-top whitespace-normal">
                        <ColumnHeader
                          column={column}
                          header={headerRow?.[column.column]}
                          fields={fields}
                          assignments={assignments}
                          onChange={setColumn}
                        />
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row, index) => (
                    <TableRow key={index}>
                      {assignments.map((column) => {
                        const value = row[column.column] ?? "";
                        return (
                          <TableCell key={column.column} className="max-w-48 truncate" title={value}>
                            {value}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          {entity === "people" && rows && missing.length === 0 && data.length > 0 ? (
            <PeopleReview
              rows={applyMapping(data, assignments)}
              members={members}
              actions={reviewActions}
              onAction={(key, action) => setReviewActions((current) => ({ ...current, [key]: action }))}
            />
          ) : null}
          {rows && missing.length > 0 && data.length > 0 && !tooMany ? (
            <p className="text-sm text-muted-foreground">{requiredMessage(missing)}</p>
          ) : null}
          {importRows.error ? (
            <p role="alert" className="text-sm text-destructive">
              {importRows.error.message}
            </p>
          ) : null}
          {result ? <ImportSummary result={result} /> : null}
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            type="button"
            disabled={!canImport}
            onClick={() => {
              const mapped = applyMapping(data, assignments);
              importRows.mutate(
                mapped.map((row, index) => {
                  const match = peopleRowMatch(
                    row,
                    members.map((member) => member.user),
                  );
                  const key = `${row.email}-${index}`;
                  return { ...row, _action: reviewActions[key] ?? defaultReviewAction(match) };
                }),
              );
            }}
          >
            {importRows.isPending ? "Importing…" : "Import"}
          </Button>
        </CardFooter>
      </Card>
    </Tabs>
  );
}

function ColumnHeader({
  column,
  header,
  fields,
  assignments,
  onChange,
}: {
  column: ColumnAssignment;
  header?: string;
  fields: ImportField[];
  assignments: ColumnAssignment[];
  onChange: (column: number, field: string | null) => void;
}) {
  const field = fields.find((item) => item.key === column.field);
  if (column.confident && field) {
    return (
      <div className="flex min-w-36 flex-col items-start gap-1 py-1">
        <div className="flex items-center gap-1">
          <span>{header || field.label}</span>
          <CheckIcon className="size-3.5 text-primary" aria-label="Matched" />
        </div>
        {header ? <span className="text-xs font-normal text-muted-foreground">{field.label}</span> : null}
        <Button type="button" variant="ghost" size="xs" onClick={() => onChange(column.column, null)}>
          Change
        </Button>
      </div>
    );
  }

  const choices = fieldChoices(fields, assignments, column.column);
  return (
    <div className="flex min-w-40 flex-col gap-1 py-1">
      {header ? <span>{header}</span> : null}
      <SelectField
        size="sm"
        aria-label={header ? `Field for ${header}` : `Field for column ${column.column + 1}`}
        value={column.field ?? "skip"}
        onValueChange={(value) => onChange(column.column, value === "skip" ? null : value)}
        options={[
          { value: "skip", label: "Don't import" },
          ...choices.map((item) => ({ value: item.key, label: item.label })),
        ]}
      />
    </div>
  );
}

function ImportSummary({ result }: { result: ImportResult }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <p className="text-sm">
        Created {result.created}. Skipped {result.skipped}.
      </p>
      {result.errors.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Rows that were not imported</p>
          <ul className="flex flex-col gap-1 text-sm text-destructive">
            {result.errors.map((error) => (
              <li key={`${error.row}-${error.message}`}>
                Row {error.row}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.passwords && result.passwords.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Share these temporary passwords. Each person chooses a new one the first time they sign in.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Temporary password</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.passwords.map((person) => (
                <TableRow key={person.email}>
                  <TableCell>{person.email}</TableCell>
                  <TableCell>{person.username}</TableCell>
                  <TableCell className="font-mono">{person.temporaryPassword}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

function PeopleReview({
  rows,
  members,
  actions,
  onAction,
}: {
  rows: Record<string, string>[];
  members: { user: { email: string | null; firstName: string | null; lastName: string | null } }[];
  actions: Record<string, ReviewAction>;
  onAction: (key: string, action: ReviewAction) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Review before import</p>
      <p className="text-xs text-muted-foreground">
        Exact email matches will be skipped unless you merge. Near matches default to Skip.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Group</TableHead>
            <TableHead>Match</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const firstName = row.firstName ?? "";
            const lastName = row.lastName ?? "";
            const match = peopleRowMatch(
              row,
              members.map((member) => member.user),
            );
            const key = `${row.email}-${index}`;
            const action = actions[key] ?? defaultReviewAction(match);
            return (
              <TableRow key={key}>
                <TableCell>
                  {firstName} {lastName}
                </TableCell>
                <TableCell>{row.username || usernameFromName(firstName, lastName)}</TableCell>
                <TableCell>{row.email}</TableCell>
                <TableCell>{row.primaryDepartment || "—"}</TableCell>
                <TableCell>{match}</TableCell>
                <TableCell>
                  <SelectField
                    value={action}
                    onValueChange={(value) => onAction(key, value as ReviewAction)}
                    options={[
                      { value: "import", label: "Import" },
                      { value: "skip", label: "Skip" },
                      { value: "merge", label: "Merge" },
                    ]}
                    className="h-8"
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
