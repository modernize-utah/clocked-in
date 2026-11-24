"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTenant } from "@/hooks/use-workspace";
import { apiGroups, defaultOperationId, type ApiContract, type ApiOperation } from "@/lib/developer/api-catalog";
import { cn } from "cn";

const methodVariant = {
  GET: "outline",
  POST: "default",
  PUT: "secondary",
  PATCH: "secondary",
  DELETE: "destructive",
} as const;

function tenantValue(operation: ApiOperation, tenantId: string, name: string) {
  if (name === "tenantId") return tenantId;
  if (name === "id" && (operation.path === "/tenants/{id}" || operation.path.startsWith("/tenants/{id}/"))) {
    return tenantId;
  }
  return "";
}

function ContractList({ heading, contracts }: { heading: string; contracts: ApiContract[] }) {
  return (
    <div className="flex flex-col gap-4">
      {contracts.map((contract, index) => (
        <div key={`${heading}-${contract.name}-${index}`} className="flex flex-col gap-2">
          <p className="font-mono text-xs font-medium">
            {heading}
            {contract.name === heading ? "" : ` · ${contract.name}`}
          </p>
          <ul className="divide-y rounded-lg border">
            {contract.fields.map((field) => (
              <li key={field.name} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                <span className="font-mono text-xs">{field.name}</span>
                <span className="text-xs text-muted-foreground">
                  {field.type}
                  {field.required ? "" : " · optional"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function initialValues(operation: ApiOperation, tenantId: string) {
  return Object.fromEntries(
    operation.parameters.filter((parameter) => parameter.location === "path").map((parameter) => [
      parameter.name,
      tenantValue(operation, tenantId, parameter.name),
    ]),
  );
}

export function ApiView() {
  const tenant = useTenant();
  const operations = useMemo(() => apiGroups.flatMap((group) => group.operations), []);
  const [selectedId, setSelectedId] = useState(defaultOperationId);
  const operation = operations.find((item) => item.id === selectedId) ?? operations[0];
  const [pathValues, setPathValues] = useState<Record<string, string>>(() =>
    operation ? initialValues(operation, tenant.id) : {},
  );
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<{ status: number; statusText: string; body: string } | null>(null);

  function select(next: ApiOperation) {
    setSelectedId(next.id);
    setPathValues(initialValues(next, tenant.id));
    setQueryValues({});
    setBody("");
    setError(null);
    setResponse(null);
  }

  async function send() {
    if (!operation) return;
    setError(null);
    let path = operation.path;
    for (const parameter of operation.parameters.filter((item) => item.location === "path")) {
      const value = pathValues[parameter.name]?.trim() ?? "";
      if (!value) {
        setError(`${parameter.name} is required.`);
        return;
      }
      path = path.replaceAll(`{${parameter.name}}`, encodeURIComponent(value));
    }
    if (path.includes("{")) {
      setError("Fill in every path parameter.");
      return;
    }

    const query = new URLSearchParams();
    for (const parameter of operation.parameters.filter((item) => item.location === "query")) {
      const value = queryValues[parameter.name]?.trim() ?? "";
      if (value) query.set(parameter.name, value);
    }
    const search = query.toString();
    const url = search ? `${path}?${search}` : path;
    const text = body.trim();
    if (text) {
      try {
        JSON.parse(text);
      } catch {
        setError("Request body must be JSON.");
        return;
      }
    }

    setPending(true);
    try {
      const result = await fetch(url, {
        method: operation.method,
        credentials: "include",
        headers: text ? { "content-type": "application/json" } : undefined,
        body: text ? text : undefined,
      });
      const raw = await result.text();
      const contentType = result.headers.get("content-type") ?? "";
      let formatted = raw;
      if (contentType.includes("json") && raw) {
        try {
          formatted = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          formatted = raw;
        }
      }
      setResponse({
        status: result.status,
        statusText: result.statusText,
        body: formatted.length > 100_000 ? `${formatted.slice(0, 100_000)}\n…` : formatted,
      });
    } catch {
      setError("The request could not be sent.");
    } finally {
      setPending(false);
    }
  }

  if (!operation) return null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>HTTP API</CardTitle>
          <CardDescription>
            Calls use your signed-in admin session. External clients send <span className="font-mono text-xs">Authorization: Bearer</span> or{" "}
            <span className="font-mono text-xs">X-Api-Key</span> with an tenant API key. Lists take <span className="font-mono text-xs">limit</span>{" "}
            (1–100, default 50) and <span className="font-mono text-xs">offset</span>. Errors are{" "}
            <span className="font-mono text-xs">{`{ "code", "message" }`}</span>: 400 validation_error, 401 unauthorized, 403 forbidden, 404 not_found,
            409 conflict.
          </CardDescription>
        </CardHeader>
      </Card>
      <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto">
          <label className="flex flex-col gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:hidden">
            Operation
            <select
              className="h-9 rounded-lg border bg-background px-2 text-sm font-normal tracking-normal text-foreground normal-case"
              value={operation.id}
              onChange={(event) => {
                const next = operations.find((item) => item.id === event.target.value);
                if (next) select(next);
              }}
            >
              {apiGroups.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.operations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.method} {item.path}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <nav className="hidden flex-col gap-4 lg:flex" aria-label="API operations">
            {apiGroups.map((group) => (
              <div key={group.group} className="flex flex-col gap-1">
                <p className="px-2 text-[0.68rem] font-medium tracking-widest text-muted-foreground uppercase">{group.group}</p>
                {group.operations.map((item) => {
                  const active = item.id === operation.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => select(item)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs",
                        active ? "bg-card font-medium text-foreground shadow-xs ring-1 ring-foreground/10" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                      )}
                    >
                      <span className="w-12 shrink-0 font-mono">{item.method}</span>
                      <span className="truncate font-mono">{item.path}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Badge variant={methodVariant[operation.method as keyof typeof methodVariant] ?? "outline"}>{operation.method}</Badge>
              <span className="font-mono text-sm font-medium">{operation.path}</span>
            </CardTitle>
            <CardDescription>
              {operation.acceptsBody
                ? "Write requests take a JSON object. Request and response contracts are listed below."
                : "This request has no body. The response contract is listed below."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {operation.parameters.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {operation.parameters.map((parameter) => {
                  const id = `${operation.id}-${parameter.location}-${parameter.name}`;
                  const value = parameter.location === "path" ? (pathValues[parameter.name] ?? "") : (queryValues[parameter.name] ?? "");
                  return (
                    <Field key={id} label={`${parameter.name}`} htmlFor={id} hint={`${parameter.location} · ${parameter.type}${parameter.required ? " · required" : ""}`}>
                      <Input
                        id={id}
                        value={value}
                        onChange={(event) => {
                          const next = event.target.value;
                          if (parameter.location === "path") setPathValues((current) => ({ ...current, [parameter.name]: next }));
                          else setQueryValues((current) => ({ ...current, [parameter.name]: next }));
                        }}
                        className="h-9 font-mono text-xs"
                      />
                    </Field>
                  );
                })}
              </div>
            ) : null}
            {operation.acceptsBody ? (
              <Field label="Request body" htmlFor={`${operation.id}-body`} hint="JSON matching the request contract.">
                <Textarea
                  id={`${operation.id}-body`}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  spellCheck={false}
                  className="min-h-28 font-mono text-xs"
                  placeholder="{ }"
                />
              </Field>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end">
              <Button
                type="button"
                className="h-9"
                disabled={pending}
                onClick={() => {
                  if (operation.method === "DELETE") setConfirming(true);
                  else void send();
                }}
              >
                {pending ? "Sending…" : "Send"}
              </Button>
            </div>
            {response ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  {response.status} {response.statusText}
                </p>
                <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                  {response.body || "(empty)"}
                </pre>
              </div>
            ) : null}
            {operation.requestContracts.length ? (
              <ContractList heading="Request" contracts={operation.requestContracts} />
            ) : null}
            {operation.contracts.length ? (
              <ContractList heading="Response" contracts={operation.contracts} />
            ) : (
              <p className="text-sm text-muted-foreground">This response has no JSON body.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Send DELETE ${operation.path}?`}
        description="This runs against the live tenant and cannot be undone."
        confirmLabel="Send"
        onConfirm={() => {
          setConfirming(false);
          void send();
        }}
      />
    </div>
  );
}
