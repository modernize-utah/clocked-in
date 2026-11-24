"use client";

import { CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { McpToolGroup } from "@/lib/mcp/catalog";

function clientConfig(origin: string) {
  return JSON.stringify(
    {
      mcpServers: {
        "clocked-in": {
          url: `${origin}/mcp`,
          headers: { Authorization: "Bearer cki_live_…" },
        },
      },
    },
    null,
    2,
  );
}

export function McpView({ origin, groups }: { origin: string; groups: McpToolGroup[] }) {
  const config = clientConfig(origin);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Connect</CardTitle>
          <CardDescription>
            MCP is Streamable HTTP at <span className="font-mono text-xs">/mcp</span>. Send the tenant API key as{" "}
            <span className="font-mono text-xs">Authorization: Bearer</span> or <span className="font-mono text-xs">X-Api-Key</span>.
            A key needs <span className="font-mono text-xs">org:read</span> to list, <span className="font-mono text-xs">org:write</span> to
            change time and catalogs, and <span className="font-mono text-xs">org:admin</span> to manage people and settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">{config}</pre>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={() => {
                void navigator.clipboard.writeText(config).then(
                  () => toast.success("Config copied."),
                  () => toast.error("Could not copy the config."),
                );
              }}
            >
              <CopyIcon />
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Auth, signup, password reset, the SuperAdmin user list, feedback moderation, and deleting an tenant are not tools.
            Production keys use the <span className="font-mono">cki_live_</span> prefix. Other environments use{" "}
            <span className="font-mono">cki_test_</span>.
          </p>
        </CardContent>
      </Card>
      {groups.map((group) => (
        <Card key={group.group}>
          <CardHeader>
            <CardTitle>{group.group}</CardTitle>
            <CardDescription>
              {group.tools.length} {group.tools.length === 1 ? "tool" : "tools"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border">
              {group.tools.map((tool) => (
                <li key={tool.name} className="flex flex-col gap-2 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium">{tool.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{tool.description}</p>
                  {tool.params.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {tool.params.map((param) => (
                        <Badge key={param.name} variant="secondary" className="font-mono">
                          {param.name}: {param.type}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
