import "server-only";
import { BlobAccessError, BlobError, BlobNotFoundError, del, get, put } from "@vercel/blob";
import sharp from "sharp";
import { fail, validation } from "@/lib/api/errors";
import { brandField, isOwnedBrandBlob, type BrandKind } from "@/lib/brand";

const maxUploadBytes = 4 * 1024 * 1024;
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

  // Production's store is public. The local token's store is private.
  // Vercel staging sets BLOB_ACCESS=public; its connected store is public.
  return process.env.VERCEL_ENV === "production" ? "public" : "private";
}

function isMissingBlob(error: unknown) {
  if (error instanceof BlobNotFoundError || error instanceof BlobAccessError) {
    return true;
  }

  return error instanceof BlobError && /\b(401|403)\b/.test(error.message);
}

function pathnameFor(organizationId: string, kind: BrandKind) {
  return `orgs/${organizationId}/${kind}.webp`;
}

export async function resizeBrandImage(file: File, kind: BrandKind) {
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

  const resized =
    kind === "mark"
      ? image.resize(64, 64, { fit: "cover", position: "centre" })
      : image.resize(800, 200, { fit: "inside", withoutEnlargement: true });

  try {
    return await resized.webp({ quality: 85, alphaQuality: 90 }).toBuffer();
  } catch {
    validation("Upload a PNG, JPEG, WebP, or GIF image.");
  }
}

export async function putBrandAsset(organizationId: string, kind: BrandKind, buffer: Buffer) {
  return put(pathnameFor(organizationId, kind), buffer, {
    access: blobAccess(),
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "image/webp",
    token: blobToken(),
  });
}

export async function encodePng(stream: ReadableStream<Uint8Array>) {
  const bytes = Buffer.from(await new Response(stream).arrayBuffer());
  return sharp(bytes).png().toBuffer();
}

export async function readBrandAsset(storedUrl: string) {
  try {
    return await get(storedUrl, { access: blobAccess(), token: blobToken(), useCache: false });
  } catch (error) {
    if (isMissingBlob(error)) {
      return null;
    }

    throw error;
  }
}

export async function deleteBrandAsset(organizationId: string, storedUrl: string | null) {
  if (!storedUrl || !isOwnedBrandBlob(organizationId, storedUrl)) {
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

export function storedBrandUrl(
  organization: { markUrl: string | null; wordmarkUrl: string | null; wordmarkOnLightUrl: string | null },
  kind: BrandKind,
) {
  return organization[brandField(kind)];
}
