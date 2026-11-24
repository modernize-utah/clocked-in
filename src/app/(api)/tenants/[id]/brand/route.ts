import { authenticate } from "@/lib/api/access";
import { uploadTenantBrand } from "@/lib/api/features/brand";
import { validation } from "@/lib/api/errors";
import { withGuids } from "@/lib/api/guid";

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    validation("Choose an image to upload.");
  }

  const kind = form.get("kind");
  return uploadTenantBrand(await authenticate(request), id, typeof kind === "string" ? kind : "", form.get("file"));
});
