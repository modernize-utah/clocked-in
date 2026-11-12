import { createContext, useContext, type ReactNode } from "react";
import type { Organization, Theme } from "@/api/types";

export type Colors = {
  primary: string;
  primaryForeground: string;
  highlight: string;
  brandAccent: string;
  success: string;
  destructive: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  secondary: string;
  accent: string;
  border: string;
  input: string;
  canvas: string;
  sidebarAccent: string;
  sidebarBorder: string;
  sidebarMuted: string;
};

type Palette = Pick<
  Theme,
  "primary" | "primaryForeground" | "highlight" | "accent" | "success" | "surface" | "surfaceForeground" | "foreground"
>;

const voluntime: Palette = {
  primary: "#001836",
  primaryForeground: "#FFFFFF",
  highlight: "#D4AC59",
  accent: "#FF5E9F",
  success: "#4EBFAE",
  surface: "#FFFFFF",
  surfaceForeground: "#001836",
  foreground: "#001836",
};

const hex = /^#[0-9a-f]{6}$/i;

function channels(color: string) {
  return [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
}

/** `share` of `color` over `base`, like CSS `color-mix(in srgb, color share%, base)`. */
export function mix(color: string, share: number, base: string) {
  const top = channels(color);
  const bottom = channels(base);
  return `#${top
    .map((value, index) => Math.round(value * share + bottom[index] * (1 - share)))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function alpha(color: string, share: number) {
  const [r, g, b] = channels(color);
  return `rgba(${r}, ${g}, ${b}, ${share})`;
}

function build(theme: Palette): Colors {
  const { surface, foreground } = theme;
  return {
    primary: theme.primary,
    primaryForeground: theme.primaryForeground,
    highlight: theme.highlight,
    brandAccent: theme.accent,
    success: theme.success,
    destructive: "#DC2626",
    background: surface,
    foreground,
    card: surface,
    cardForeground: theme.surfaceForeground,
    muted: mix(foreground, 0.06, surface),
    mutedForeground: mix(foreground, 0.72, surface),
    secondary: mix(foreground, 0.08, surface),
    accent: mix(theme.accent, 0.14, surface),
    border: mix(foreground, 0.12, surface),
    input: mix(foreground, 0.12, surface),
    canvas: mix(foreground, 0.024, surface),
    sidebarAccent: alpha(theme.primaryForeground, 0.12),
    sidebarBorder: alpha(theme.primaryForeground, 0.14),
    sidebarMuted: alpha(theme.primaryForeground, 0.6),
  };
}

export const fallbackColors = build(voluntime);

export function colorsFromTheme(theme?: Theme | null): Colors {
  if (!theme) return fallbackColors;
  const palette: Palette = {
    primary: theme.primary,
    primaryForeground: theme.primaryForeground,
    highlight: theme.highlight,
    accent: theme.accent,
    success: theme.success,
    surface: theme.surface,
    surfaceForeground: theme.surfaceForeground,
    foreground: theme.foreground,
  };
  if (!Object.values(palette).every((color) => hex.test(color))) return fallbackColors;
  return build(palette);
}

function pluralize(label: string) {
  if (label.endsWith("s") || label.endsWith("S")) return label;
  if (/[yY]$/.test(label) && !/[aeiouAEIOU][yY]$/.test(label)) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
}

export function entityLabels(organization?: Organization | null) {
  const labels = organization?.preferences.entityLabels;
  const entity = {
    organization: labels?.organization || "Organization",
    project: labels?.project || "Project",
    department: labels?.department || "Department",
    taskCategory: labels?.taskCategory || "Task category",
  };
  return {
    ...entity,
    organizations: pluralize(entity.organization),
    projects: pluralize(entity.project),
    departments: pluralize(entity.department),
    taskCategories: pluralize(entity.taskCategory),
  };
}

const ThemeContext = createContext<Colors>(fallbackColors);

export function ThemeProvider({ colors, children }: { colors: Colors; children: ReactNode }) {
  return <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>;
}

export function useColors() {
  return useContext(ThemeContext);
}
