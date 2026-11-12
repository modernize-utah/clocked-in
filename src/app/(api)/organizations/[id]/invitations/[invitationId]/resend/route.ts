import { authenticate } from "@/lib/api/access";
import { resendOrganizationInvitation } from "@/lib/api/features/invitations";
import { withGuids } from "@/lib/api/guid";

export const POST = withGuids<{ id: string; invitationId: string }>(async (request, { id, invitationId }) =>
  resendOrganizationInvitation(await authenticate(request), id, invitationId),
);
