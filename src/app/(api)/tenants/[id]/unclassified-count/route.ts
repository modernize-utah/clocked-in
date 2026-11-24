import { authenticate } from "@/lib/api/access";
import { countUnclassified } from "@/lib/api/features/time-entries";
import { withGuids } from "@/lib/api/guid";

export const GET = withGuids<{ id: string }>(async (request, { id }) => ({
  count: await countUnclassified(await authenticate(request), id),
}));
