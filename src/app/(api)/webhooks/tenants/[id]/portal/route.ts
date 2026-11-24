import { ingestPortalWebhook } from "@/lib/api/features/external-sync";
import { respond } from "@/lib/api/respond";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await context.params;
    const rawBody = await request.text();
    const signature =
      request.headers.get("caswj-signature") ||
      request.headers.get("CASWJ-Signature") ||
      request.headers.get("clocked-in-signature");
    return ingestPortalWebhook({
      tenantId: id,
      rawBody,
      signatureHeader: signature,
    });
  });
}
