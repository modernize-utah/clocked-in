import { authenticate } from "@/lib/api/access";
import { removeOrganizationBrand } from "@/lib/api/features/brand";
import { emptyNotFound, parseGuid } from "@/lib/api/guid";
import { respond } from "@/lib/api/respond";

export function DELETE(request: Request, context: { params: Promise<{ id: string; kind: string }> }) {
  return respond(async () => {
    const params = await context.params;
    const id = parseGuid(params.id);
    if (!id) {
      return emptyNotFound();
    }

    return removeOrganizationBrand(await authenticate(request), id, params.kind);
  });
}
