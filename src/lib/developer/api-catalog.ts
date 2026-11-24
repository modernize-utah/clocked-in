import document from "./openapi.json";

type JsonSchema = {
  $ref?: string;
  type?: string | string[];
  format?: string;
  properties?: Record<string, JsonSchema | undefined>;
  required?: string[];
  items?: JsonSchema;
  oneOf?: JsonSchema[];
  description?: string;
};

type OpenApiDocument = {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, JsonSchema> };
};

type OpenApiOperation = {
  tags?: string[];
  parameters?: {
    name: string;
    in: string;
    required?: boolean;
    schema?: JsonSchema;
  }[];
  requestBody?: { content?: Record<string, { schema?: JsonSchema }> };
  responses?: Record<string, { content?: Record<string, { schema?: JsonSchema }> }>;
};

const spec = document as OpenApiDocument;
const schemas = spec.components?.schemas ?? {};

const methods = ["get", "post", "put", "patch", "delete"];

const groupRules: [string, string][] = [
  ["/platform", "Platform"],
  ["/api-keys", "API keys"],
  ["/memberships", "Memberships"],
  ["/connections", "Connections"],
  ["/invitations", "Invitations"],
  ["/themes", "Themes"],
  ["/hourly-rates", "Hourly rates"],
  ["/task-categories", "Task categories"],
  ["/imports", "Imports"],
  ["/tenants", "Organizations"],
  ["/projects", "Projects"],
  ["/time-entries.csv", "Reports"],
  ["/access-requests", "Access requests"],
  ["/time-entries", "Time entries"],
  ["/summary.csv", "Reports"],
  ["/report", "Reports"],
  ["/collective-time-entries", "Collective time"],
  ["/volunteer-needs", "Volunteer needs"],
  ["/tags", "Tags"],
  ["/feedback", "Feedback"],
  ["/auth", "Auth"],
  ["/users", "Users"],
  ["/roles", "Roles"],
  ["/time/", "Time"],
  ["/health", "Health"],
  ["/tenants", "Tenants"],
];

export type ApiParameter = {
  name: string;
  location: "path" | "query";
  required: boolean;
  type: string;
};

export type ApiField = { name: string; type: string; required: boolean };
export type ApiContract = { name: string; fields: ApiField[] };

export type ApiOperation = {
  id: string;
  group: string;
  method: string;
  path: string;
  parameters: ApiParameter[];
  acceptsBody: boolean;
  requestContracts: ApiContract[];
  contracts: ApiContract[];
};

export type ApiGroup = { group: string; operations: ApiOperation[] };

function refName(ref: string) {
  return ref.split("/").pop() ?? ref;
}

function camel(name: string) {
  return name ? name[0].toLowerCase() + name.slice(1) : name;
}

function typeLabel(schema: JsonSchema | undefined): string {
  if (!schema) return "unknown";
  if (schema.$ref) return refName(schema.$ref);
  if (schema.oneOf?.length) {
    const labels = schema.oneOf.map((item) => typeLabel(item)).filter((label) => label !== "null" && label !== "unknown");
    const hasNull = schema.oneOf.some((item) => item.type === "null" || (Array.isArray(item.type) && item.type.includes("null")));
    const joined = labels.join(" | ") || "unknown";
    return hasNull && !joined.endsWith("| null") ? `${joined} | null` : joined;
  }
  if (schema.format === "uuid") return nullable(schema, "uuid");
  if (schema.format === "date-time") return nullable(schema, "date-time");
  if (schema.format === "date") return nullable(schema, "date");
  if (schema.format === "int32" || schema.format === "int64") return nullable(schema, "integer");
  if (schema.format === "double" || schema.format === "decimal" || schema.format === "float") return nullable(schema, "number");
  if (schema.type === "array" || (Array.isArray(schema.type) && schema.type.includes("array"))) {
    return nullable(schema, `${typeLabel(schema.items)}[]`);
  }
  const types = (Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []).filter((type) => type !== "null" && type !== "array");
  const label = types.join(" | ") || "unknown";
  return nullable(schema, label);
}

function nullable(schema: JsonSchema, label: string) {
  const types = Array.isArray(schema.type) ? schema.type : [];
  return types.includes("null") && !label.endsWith("| null") ? `${label} | null` : label;
}

function fieldsOf(schema: JsonSchema | undefined): ApiField[] {
  if (!schema?.properties) return [];
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, property]) => ({
    name,
    type: typeLabel(property),
    required: required.has(name),
  }));
}

function resolve(schema: JsonSchema | undefined): JsonSchema | undefined {
  if (!schema?.$ref) return schema;
  return schemas[refName(schema.$ref)] ?? schema;
}

function contractsFromSchema(schema: JsonSchema | undefined, fallbackName: string): ApiContract[] {
  if (!schema) return [];
  if (schema.oneOf?.length) {
    return schema.oneOf.flatMap((item, index) => contractsFromSchema(item, item.$ref ? refName(item.$ref) : `${fallbackName} ${index + 1}`));
  }

  const root = resolve(schema);
  const name = schema.$ref ? refName(schema.$ref) : fallbackName;
  const contracts: ApiContract[] = [{ name, fields: fieldsOf(root) }];
  const seen = new Set<string>([name]);

  for (const field of contracts[0].fields) {
    const property = root?.properties?.[field.name];
    const ref = property?.$ref ?? property?.items?.$ref;
    if (!ref) continue;
    const nestedName = refName(ref);
    if (seen.has(nestedName)) continue;
    seen.add(nestedName);
    const nested = schemas[nestedName];
    if (nested?.properties) contracts.push({ name: nestedName, fields: fieldsOf(nested) });
  }

  return contracts.filter((contract) => contract.fields.length > 0);
}

function contractsFor(operation: OpenApiOperation): ApiContract[] {
  const response = Object.entries(operation.responses ?? {})
    .filter(([status]) => status.startsWith("2"))
    .sort(([left], [right]) => left.localeCompare(right))[0]?.[1];
  return contractsFromSchema(response?.content?.["application/json"]?.schema, "Response");
}

function requestContractsFor(operation: OpenApiOperation): ApiContract[] {
  return contractsFromSchema(operation.requestBody?.content?.["application/json"]?.schema, "Request");
}

function parametersFor(path: string, operation: OpenApiOperation): ApiParameter[] {
  const pathNames = new Set([...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]));
  return (operation.parameters ?? [])
    .filter((parameter) => parameter.in === "path" || parameter.in === "query")
    .map((parameter) => {
      const location = parameter.in === "path" ? "path" : "query";
      const name = location === "path" ? (pathNames.has(parameter.name) ? parameter.name : camel(parameter.name)) : camel(parameter.name);
      return {
        name,
        location,
        required: location === "path" || parameter.required === true,
        type: typeLabel(parameter.schema),
      } satisfies ApiParameter;
    });
}

function groupFor(path: string, tags: string[] | undefined) {
  if (tags?.[0]) return tags[0];
  return groupRules.find(([needle]) => path.includes(needle))?.[1] ?? "Other";
}

function buildGroups(): ApiGroup[] {
  const operations: ApiOperation[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of methods) {
      const operation = item[method];
      if (!operation) continue;
      operations.push({
        id: `${method} ${path}`,
        group: groupFor(path, operation.tags),
        method: method.toUpperCase(),
        path,
        parameters: parametersFor(path, operation),
        acceptsBody: Boolean(operation.requestBody),
        requestContracts: requestContractsFor(operation),
        contracts: contractsFor(operation),
      });
    }
  }

  const order = groupRules.map(([, label]) => label);
  const groups = new Map<string, ApiOperation[]>();
  for (const operation of operations) {
    const list = groups.get(operation.group) ?? [];
    list.push(operation);
    groups.set(operation.group, list);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => {
      const leftIndex = order.indexOf(left);
      const rightIndex = order.indexOf(right);
      return (leftIndex === -1 ? order.length : leftIndex) - (rightIndex === -1 ? order.length : rightIndex);
    })
    .map(([group, list]) => ({ group, operations: list }));
}

export const apiGroups = buildGroups();

export const defaultOperationId = apiGroups.flatMap((group) => group.operations).find((operation) => operation.id === "get /tenants/{id}")?.id
  ?? apiGroups[0]?.operations[0]?.id
  ?? "";
