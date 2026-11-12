import { Access } from "@/lib/api/access";
import { validation } from "@/lib/api/errors";
import { getUser, parseUpdateUser, updateUser } from "@/lib/api/features/users";
import { deleteAvatarAsset, uploadAvatar } from "@/lib/server/avatar-assets";

export async function uploadMyAvatar(access: Access, file: unknown) {
  const caller = access.requireHuman();
  const current = await getUser(access, caller.id);
  const previous = current.profile?.avatarUrl ?? null;
  if (!(file instanceof File)) {
    validation("Choose an image to upload.");
  }

  const uploaded = await uploadAvatar(caller.id, file);
  try {
    const updated = await updateUser(access, caller.id, parseUpdateUser({ avatarUrl: uploaded }), true);
    const next = updated.profile?.avatarUrl ?? null;
    if (previous && previous !== next) {
      try {
        await deleteAvatarAsset(caller.id, previous);
      } catch (error) {
        console.error(error);
      }
    }

    return updated;
  } catch (error) {
    await deleteAvatarAsset(caller.id, uploaded);
    throw error;
  }
}

export async function deleteMyAvatar(access: Access) {
  const caller = access.requireHuman();
  const current = await getUser(access, caller.id);
  const previous = current.profile?.avatarUrl ?? null;
  const updated = await updateUser(access, caller.id, parseUpdateUser({ avatarUrl: null }), true);
  if (previous) {
    try {
      await deleteAvatarAsset(caller.id, previous);
    } catch (error) {
      console.error(error);
    }
  }

  return updated;
}
