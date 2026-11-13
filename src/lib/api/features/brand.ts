import { Access } from "@/lib/api/access";
import { validation } from "@/lib/api/errors";
import { parseUpdateOrganization, updateOrganization } from "@/lib/api/features/organizations";
import { brandField, isBrandKind, type BrandKind } from "@/lib/brand";
import { deleteBrandAsset, putBrandAsset, resizeBrandImage, storedBrandUrl } from "@/lib/server/brand-assets";

export function requireBrandKind(kind: string): BrandKind {
  if (!isBrandKind(kind)) {
    validation("kind must be mark, wordmark, or wordmarkOnLight.");
  }

  return kind;
}

export async function uploadOrganizationBrand(access: Access, organizationId: string, kind: string, file: unknown) {
  const asset = requireBrandKind(kind);
  const organization = await access.requireOrganizationAdmin(organizationId);
  if (!(file instanceof File)) {
    validation("Choose an image to upload.");
  }

  const buffer = await resizeBrandImage(file, asset);
  const blob = await putBrandAsset(organizationId, asset, buffer);
  const previous = storedBrandUrl(organization, asset);
  const updated = await updateOrganization(
    access,
    organizationId,
    parseUpdateOrganization({ [brandField(asset)]: blob.url }),
  );
  if (previous && previous !== blob.url) {
    await deleteBrandAsset(organizationId, previous);
  }

  return updated;
}

export async function removeOrganizationBrand(access: Access, organizationId: string, kind: string) {
  const asset = requireBrandKind(kind);
  const organization = await access.requireOrganizationAdmin(organizationId);
  const previous = storedBrandUrl(organization, asset);
  const updated = await updateOrganization(access, organizationId, parseUpdateOrganization({ [brandField(asset)]: null }));
  await deleteBrandAsset(organizationId, previous);
  return updated;
}
