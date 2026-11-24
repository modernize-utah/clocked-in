import { Access } from "@/lib/api/access";
import { validation } from "@/lib/api/errors";
import { parseUpdateTenant, updateTenant } from "@/lib/api/features/tenants";
import { brandField, isBrandKind, type BrandKind } from "@/lib/brand";
import { deleteBrandAsset, putBrandAsset, resizeBrandImage, storedBrandUrl } from "@/lib/server/brand-assets";

export function requireBrandKind(kind: string): BrandKind {
  if (!isBrandKind(kind)) {
    validation("kind must be mark, wordmark, or wordmarkOnLight.");
  }

  return kind;
}

export async function uploadTenantBrand(access: Access, tenantId: string, kind: string, file: unknown) {
  const asset = requireBrandKind(kind);
  const tenant = await access.requireTenantAdmin(tenantId);
  if (!(file instanceof File)) {
    validation("Choose an image to upload.");
  }

  const buffer = await resizeBrandImage(file, asset);
  const blob = await putBrandAsset(tenantId, asset, buffer);
  const previous = storedBrandUrl(tenant, asset);
  const updated = await updateTenant(
    access,
    tenantId,
    parseUpdateTenant({ [brandField(asset)]: blob.url }),
  );
  if (previous && previous !== blob.url) {
    await deleteBrandAsset(tenantId, previous);
  }

  return updated;
}

export async function removeTenantBrand(access: Access, tenantId: string, kind: string) {
  const asset = requireBrandKind(kind);
  const tenant = await access.requireTenantAdmin(tenantId);
  const previous = storedBrandUrl(tenant, asset);
  const updated = await updateTenant(access, tenantId, parseUpdateTenant({ [brandField(asset)]: null }));
  await deleteBrandAsset(tenantId, previous);
  return updated;
}
