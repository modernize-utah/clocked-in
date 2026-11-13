import { ApiError } from "@/lib/api/errors";
import { emptyNotFound, withGuids } from "@/lib/api/guid";
import { getUser } from "@/lib/api/features/users";
import { isOwnedAvatarBlob, isVercelBlobUrl } from "@/lib/brand";
import { readAvatarAsset } from "@/lib/server/avatar-assets";
import { getAccess } from "@/lib/server/session";
import { safeHttpUrl } from "@/lib/url";

export const GET = withGuids<{ userId: string }>(async (_request, { userId }) => {
  const access = await getAccess();
  if (!access) {
    return emptyNotFound();
  }

  let storedUrl: string | null;
  try {
    const user = await getUser(access, userId);
    storedUrl = user.profile?.avatarUrl ?? null;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      return emptyNotFound();
    }

    throw error;
  }

  if (!storedUrl) {
    return emptyNotFound();
  }

  if (!isVercelBlobUrl(storedUrl)) {
    const external = safeHttpUrl(storedUrl);
    return external ? Response.redirect(external, 302) : emptyNotFound();
  }

  if (!isOwnedAvatarBlob(userId, storedUrl)) {
    return emptyNotFound();
  }

  const result = await readAvatarAsset(storedUrl);
  if (!result || result.statusCode !== 200 || !result.stream) {
    return emptyNotFound();
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || "image/webp",
      "Cache-Control": "private, max-age=86400",
    },
  });
});
