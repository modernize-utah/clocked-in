import { Access } from "@/lib/api/access";
import { guard, transaction } from "@/lib/api/db";
import { notFound, validation } from "@/lib/api/errors";
import { Body, has, list, requireName, requireString } from "@/lib/api/json";
import { prisma } from "@/lib/prisma";

export const clockedInThemeId = "44444444-4444-4444-8444-444444444441";

export type ThemeJson = {
  id: string;
  name: string;
  tenantId: string | null;
  primary: string;
  primaryForeground: string;
  highlight: string;
  accent: string;
  success: string;
  surface: string;
  surfaceForeground: string;
  foreground: string;
  chartColor: string;
  headingFont: string;
  bodyFont: string;
  categoricalPalette: string[];
  sequentialPalette: string[];
  divergingPalette: string[];
};

const hexColor = /^#[0-9A-Fa-f]{6}$/;

function parsePaletteJson(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function themeJson(theme: {
  id: string;
  name: string;
  tenantId: string | null;
  primary: string;
  primaryForeground: string;
  highlight: string;
  accent: string;
  success: string;
  surface: string;
  surfaceForeground: string;
  foreground: string;
  chartColor: string;
  headingFont: string;
  bodyFont: string;
  categoricalPalette: string;
  sequentialPalette: string;
  divergingPalette: string;
}): ThemeJson {
  return {
    id: theme.id,
    name: theme.name,
    tenantId: theme.tenantId,
    primary: theme.primary,
    primaryForeground: theme.primaryForeground,
    highlight: theme.highlight,
    accent: theme.accent,
    success: theme.success,
    surface: theme.surface,
    surfaceForeground: theme.surfaceForeground,
    foreground: theme.foreground,
    chartColor: theme.chartColor,
    headingFont: theme.headingFont,
    bodyFont: theme.bodyFont,
    categoricalPalette: parsePaletteJson(theme.categoricalPalette),
    sequentialPalette: parsePaletteJson(theme.sequentialPalette),
    divergingPalette: parsePaletteJson(theme.divergingPalette),
  };
}

function hex(body: Body, key: string) {
  const value = requireString(body, key);
  if (!hexColor.test(value)) {
    validation(`${key} must be a #RRGGBB color.`);
  }

  return value.toUpperCase();
}

function font(body: Body, key: string) {
  const value = requireString(body, key);
  if (value !== "HelveticaNeue" && value !== "AvenirNext" && value !== "SourceSans3" && value !== "NunitoSans" && value !== "Geist") {
    validation(`${key} must be HelveticaNeue, AvenirNext, SourceSans3, NunitoSans, or Geist.`);
  }

  return value;
}

function palette(body: Body, key: string, min: number, max: number) {
  if (!has(body, key) || !Array.isArray(body[key])) {
    validation(`${key} must be an array of #RRGGBB colors.`);
  }

  const colors = (body[key] as unknown[]).map((item, index) => {
    if (typeof item !== "string" || !hexColor.test(item)) {
      validation(`${key}[${index}] must be a #RRGGBB color.`);
    }

    return item.toUpperCase();
  });
  if (colors.length < min || colors.length > max) {
    validation(`${key} must have ${min} to ${max} colors.`);
  }

  return colors;
}

export type ThemeWriteRequest = {
  name: string;
  primary: string;
  primaryForeground: string;
  highlight: string;
  accent: string;
  success: string;
  surface: string;
  surfaceForeground: string;
  foreground: string;
  chartColor: string;
  headingFont: string;
  bodyFont: string;
  categoricalPalette: string[];
  sequentialPalette: string[];
  divergingPalette: string[];
};

export function parseThemeWrite(body: Body): ThemeWriteRequest {
  return {
    name: requireName(requireString(body, "name")),
    primary: hex(body, "primary"),
    primaryForeground: hex(body, "primaryForeground"),
    highlight: hex(body, "highlight"),
    accent: hex(body, "accent"),
    success: hex(body, "success"),
    surface: hex(body, "surface"),
    surfaceForeground: hex(body, "surfaceForeground"),
    foreground: hex(body, "foreground"),
    chartColor: hex(body, "chartColor"),
    headingFont: font(body, "headingFont"),
    bodyFont: font(body, "bodyFont"),
    categoricalPalette: palette(body, "categoricalPalette", 6, 8),
    sequentialPalette: palette(body, "sequentialPalette", 5, 10),
    divergingPalette: palette(body, "divergingPalette", 7, 7),
  };
}

function paletteText(colors: string[]) {
  return JSON.stringify(colors);
}

function themeData(request: ThemeWriteRequest) {
  return {
    name: request.name,
    primary: request.primary,
    primaryForeground: request.primaryForeground,
    highlight: request.highlight,
    accent: request.accent,
    success: request.success,
    surface: request.surface,
    surfaceForeground: request.surfaceForeground,
    foreground: request.foreground,
    chartColor: request.chartColor,
    headingFont: request.headingFont,
    bodyFont: request.bodyFont,
    categoricalPalette: paletteText(request.categoricalPalette),
    sequentialPalette: paletteText(request.sequentialPalette),
    divergingPalette: paletteText(request.divergingPalette),
  };
}

export async function listThemes(access: Access, tenantId: string) {
  await access.requireTenant(tenantId, false);
  const items = await prisma.theme.findMany({
    where: { OR: [{ tenantId: null }, { tenantId }] },
    orderBy: [{ tenantId: "asc" }, { name: "asc" }],
  });
  return list(items.map(themeJson), { limit: items.length, offset: 0 });
}

export async function createTheme(access: Access, tenantId: string, request: ThemeWriteRequest) {
  await access.requireTenantAdmin(tenantId);
  const theme = await guard(prisma.theme.create({ data: { tenantId, ...themeData(request) } }));
  return themeJson(theme);
}

export async function updateTheme(access: Access, tenantId: string, themeId: string, request: ThemeWriteRequest) {
  await access.requireTenantAdmin(tenantId);
  const theme = await prisma.theme.findFirst({ where: { id: themeId, tenantId } });
  if (!theme) {
    notFound();
  }

  return themeJson(await guard(prisma.theme.update({ where: { id: themeId }, data: themeData(request) })));
}

export async function deleteTheme(access: Access, tenantId: string, themeId: string) {
  await access.requireTenantAdmin(tenantId);
  const theme = await prisma.theme.findFirst({ where: { id: themeId, tenantId } });
  if (!theme) {
    notFound();
  }

  await transaction(async (tx) => {
    await tx.tenant.updateMany({
      where: { id: tenantId, themeId },
      data: { themeId: clockedInThemeId },
    });
    await tx.theme.delete({ where: { id: themeId } });
  });
}
