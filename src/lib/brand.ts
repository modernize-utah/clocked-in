import type { CSSProperties } from "react";
import type { ThemeJson } from "@/lib/api/features/themes";

export const brandFonts = ["HelveticaNeue", "AvenirNext", "SourceSans3", "NunitoSans", "Geist"] as const;

export const brandFontLabels: Record<(typeof brandFonts)[number], string> = {
  HelveticaNeue: "Helvetica Neue",
  AvenirNext: "Avenir Next",
  SourceSans3: "Source Sans 3",
  NunitoSans: "Nunito Sans",
  Geist: "Geist",
};

const fontVars: Record<string, string> = {
  HelveticaNeue: '"Helvetica Neue", Helvetica, Arial, var(--font-source-sans), sans-serif',
  AvenirNext: '"Avenir Next", Avenir, var(--font-nunito), sans-serif',
  SourceSans3: "var(--font-source-sans)",
  NunitoSans: "var(--font-nunito)",
  Geist: "var(--font-geist)",
};

export const clockedInTheme: ThemeJson = {
  id: "44444444-4444-4444-8444-444444444441",
  name: "VolunTime",
  organizationId: null,
  primary: "#001836",
  primaryForeground: "#FFFFFF",
  highlight: "#D4AC59",
  accent: "#FF5E9F",
  success: "#4EBFAE",
  surface: "#FFFFFF",
  surfaceForeground: "#001836",
  foreground: "#001836",
  chartColor: "#001836",
  headingFont: "SourceSans3",
  bodyFont: "NunitoSans",
  categoricalPalette: ["#001836", "#D4AC59", "#2A6F97", "#4EBFAE", "#C17B4A", "#6B7C93"],
  sequentialPalette: ["#F4F0E6", "#E8D7A8", "#D4AC59", "#8A6E2F", "#3D3014"],
  divergingPalette: ["#8B3A2A", "#C17B4A", "#E8C9A8", "#F7F4EE", "#A8C4D4", "#2A6F97", "#001836"],
};

const hexColor = /^#[0-9A-Fa-f]{6}$/;
export const chartColorCount = 10;

export function brandCss(theme: ThemeJson | null) {
  const declarations = Object.entries(brandStyle(theme))
    .map(([key, value]) => `${key}:${value};`)
    .join("");
  return declarations ? `:root{${declarations}}` : "";
}

export function brandStyle(theme: ThemeJson | null): CSSProperties {
  if (!theme) {
    return {};
  }

  const colors = [
    theme.primary,
    theme.primaryForeground,
    theme.highlight,
    theme.accent,
    theme.success,
    theme.surface,
    theme.surfaceForeground,
    theme.foreground,
    theme.chartColor,
  ];
  if (!colors.every((color) => hexColor.test(color))) {
    return {};
  }

  const chartVars = Object.fromEntries(
    Array.from({ length: chartColorCount }, (_, index) => [`--chart-${index + 1}`, theme.chartColor]),
  );

  return {
    "--primary": theme.primary,
    "--primary-foreground": theme.primaryForeground,
    "--ring": theme.primary,
    "--sidebar": theme.primary,
    "--sidebar-foreground": theme.primaryForeground,
    "--sidebar-primary": theme.highlight,
    "--sidebar-primary-foreground": theme.primary,
    "--sidebar-accent": `color-mix(in oklch, ${theme.primaryForeground} 12%, transparent)`,
    "--sidebar-accent-foreground": theme.primaryForeground,
    "--sidebar-border": `color-mix(in oklch, ${theme.primaryForeground} 14%, transparent)`,
    "--accent": `color-mix(in oklch, ${theme.accent} 14%, ${theme.surface})`,
    "--accent-foreground": theme.foreground,
    "--brand-accent": theme.accent,
    "--highlight": theme.highlight,
    "--success": theme.success,
    "--background": theme.surface,
    "--card": theme.surface,
    "--popover": theme.surface,
    "--foreground": theme.foreground,
    "--card-foreground": theme.surfaceForeground,
    "--popover-foreground": theme.surfaceForeground,
    "--muted": `color-mix(in oklch, ${theme.foreground} 6%, ${theme.surface})`,
    "--muted-foreground": `color-mix(in oklch, ${theme.foreground} 72%, ${theme.surface})`,
    "--secondary": `color-mix(in oklch, ${theme.foreground} 8%, ${theme.surface})`,
    "--secondary-foreground": theme.foreground,
    "--border": `color-mix(in oklch, ${theme.foreground} 12%, ${theme.surface})`,
    "--input": `color-mix(in oklch, ${theme.foreground} 12%, ${theme.surface})`,
    "--brand-accent-image": `linear-gradient(90deg, ${theme.accent}, ${theme.highlight}, ${theme.success})`,
    "--font-sans": fontVars[theme.bodyFont] ?? "var(--font-geist)",
    "--font-heading": fontVars[theme.headingFont] ?? "var(--font-geist)",
    ...chartVars,
  } as CSSProperties;
}

export function chartColor(index: number) {
  return `var(--chart-${Math.min(Math.max(index, 0), chartColorCount - 1) + 1})`;
}

export const brandKinds = ["mark", "wordmark", "wordmarkOnLight"] as const;
export type BrandKind = (typeof brandKinds)[number];

const brandFields = {
  mark: "markUrl",
  wordmark: "wordmarkUrl",
  wordmarkOnLight: "wordmarkOnLightUrl",
} as const;

export function isBrandKind(value: string): value is BrandKind {
  return value === "mark" || value === "wordmark" || value === "wordmarkOnLight";
}

export function brandField(kind: BrandKind) {
  return brandFields[kind];
}

export function isVercelBlobUrl(url: string) {
  try {
    const { hostname } = new URL(url);
    return hostname === "blob.vercel-storage.com" || hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return url.startsWith("orgs/");
  }
}

/** The store path of a Blob URL or stored Blob path, without a leading slash. */
function blobPathname(storedUrl: string) {
  if (!isVercelBlobUrl(storedUrl)) {
    return null;
  }

  try {
    return new URL(storedUrl).pathname.replace(/^\/+/, "");
  } catch {
    return storedUrl;
  }
}

/** Brand files live under orgs/<organizationId>/. Another organization's path must never be read or deleted. */
export function isOwnedBrandBlob(organizationId: string, storedUrl: string) {
  return blobPathname(storedUrl)?.startsWith(`orgs/${organizationId}/`) ?? false;
}

/** Avatars live under avatars/<userId>/. */
export function isOwnedAvatarBlob(userId: string, storedUrl: string) {
  return blobPathname(storedUrl)?.startsWith(`avatars/${userId}/`) ?? false;
}

export function brandAssetSrc(kind: BrandKind, storedUrl: string | null) {
  if (!storedUrl) {
    return null;
  }

  if (storedUrl.startsWith("/") || (/^https?:\/\//i.test(storedUrl) && !isVercelBlobUrl(storedUrl))) {
    return storedUrl;
  }

  return `/brand/${kind}?v=${encodeURIComponent(storedUrl)}`;
}

export function wordmarkSrc(
  organization: { wordmarkUrl: string | null; wordmarkOnLightUrl: string | null } | null,
  surface: "dark" | "light",
) {
  if (!organization) {
    return null;
  }

  const preferred = surface === "dark" ? organization.wordmarkUrl : organization.wordmarkOnLightUrl;
  const fallback = surface === "dark" ? organization.wordmarkOnLightUrl : organization.wordmarkUrl;
  const preferredKind = surface === "dark" ? "wordmark" : "wordmarkOnLight";
  const fallbackKind = surface === "dark" ? "wordmarkOnLight" : "wordmark";
  return brandAssetSrc(preferredKind, preferred) ?? brandAssetSrc(fallbackKind, fallback);
}
