import "server-only";
import { randomUUID } from "node:crypto";
import { BlobAccessError, BlobError, BlobNotFoundError, del, get, put } from "@vercel/blob";
import sharp from "sharp";
import { fail, validation } from "@/lib/api/errors";
import { isOwnedAvatarBlob } from "@/lib/brand";

const maxUploadBytes = 4 * 1024 * 1024;
const outputSize = 512;
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const allowedFormats = new Set(["png", "jpeg", "webp", "gif"]);

function blobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    fail(500, "server_error", "Blob storage is not configured.");
  }

  return token;
}

function blobAccess(): "public" | "private" {
  const configured = process.env.BLOB_ACCESS?.trim().toLowerCase();
  if (configured === "public" || configured === "private") {
    return configured;
  }

  return process.env.VERCEL_ENV === "production" ? "public" : "private";
}

function isMissingBlob(error: unknown) {
  if (error instanceof BlobNotFoundError || error instanceof BlobAccessError) {
    return true;
  }

  return error instanceof BlobError && /\b(401|403)\b/.test(error.message);
}

export { isOwnedAvatarBlob };

export async function uploadAvatar(userId: string, file: File) {
  if (!(file instanceof File) || file.size === 0) {
    validation("Choose an image to upload.");
  }

  if (file.size > maxUploadBytes) {
    validation("Image must be 4 MB or smaller.");
  }

  if (file.type && !allowedTypes.has(file.type)) {
    validation("Upload a PNG, JPEG, WebP, or GIF image.");
  }

  const input = Buffer.from(await file.arrayBuffer());
  let image: ReturnType<typeof sharp>;
  try {
    image = sharp(input, { failOn: "none", pages: 1 }).rotate();
  } catch {
    validation("Upload a PNG, JPEG, WebP, or GIF image.");
  }

  const metadata = await image.metadata();
  if (!metadata.format || !allowedFormats.has(metadata.format)) {
    validation("Upload a PNG, JPEG, WebP, or GIF image.");
  }

  let buffer: Buffer;
  try {
    buffer = await image
      .resize(outputSize, outputSize, { fit: "cover", position: "centre" })
      .webp({ quality: 85, alphaQuality: 90 })
      .toBuffer();
  } catch {
    validation("Upload a PNG, JPEG, WebP, or GIF image.");
  }

  const stored = await put(`avatars/${userId}/${randomUUID()}.webp`, buffer, {
    access: blobAccess(),
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "image/webp",
    token: blobToken(),
  });
  return stored.url;
}

export async function readAvatarAsset(storedUrl: string) {
  try {
    return await get(storedUrl, { access: blobAccess(), token: blobToken(), useCache: false });
  } catch (error) {
    if (isMissingBlob(error)) {
      return null;
    }

    throw error;
  }
}

export async function deleteAvatarAsset(userId: string, storedUrl: string | null) {
  if (!storedUrl || !isOwnedAvatarBlob(userId, storedUrl)) {
    return;
  }

  try {
    await del(storedUrl, { token: blobToken() });
  } catch (error) {
    if (isMissingBlob(error)) {
      return;
    }

    throw error;
  }
}
