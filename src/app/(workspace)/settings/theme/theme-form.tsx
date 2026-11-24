"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MinusIcon, PlusIcon } from "lucide-react";
import { applyThemeAction, deleteThemeAction, saveThemeAction } from "@/app/actions/tenants";
import { Field } from "@/components/field";
import { SelectField } from "@/components/select-field";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useCardPin } from "@/hooks/use-card-pin";
import { useTenant } from "@/hooks/use-workspace";
import { brandFontLabels, brandFonts, brandStyle, clockedInTheme } from "@/lib/brand";
import { keys, themesQuery } from "@/lib/queries";
import { sequentialPaletteFrom } from "@/lib/sequential-palette";
import type { Theme } from "@/lib/types";

const colorFields = [
  { key: "primary", label: "Primary" },
  { key: "primaryForeground", label: "Primary text" },
  { key: "highlight", label: "Highlight" },
  { key: "accent", label: "Accent" },
  { key: "success", label: "Success" },
  { key: "surface", label: "Surface" },
  { key: "surfaceForeground", label: "Surface text" },
  { key: "foreground", label: "Foreground" },
] as const;

const fontOptions = brandFonts.map((font) => ({
  value: font,
  label: brandFontLabels[font],
}));

const hexColor = /^#[0-9A-Fa-f]{6}$/;

function cloneTheme(theme: Theme): Theme {
  return {
    ...theme,
    categoricalPalette: [...theme.categoricalPalette],
    sequentialPalette: [...theme.sequentialPalette],
    divergingPalette: [...theme.divergingPalette],
  };
}

function SequentialPaletteGenerator({
  theme,
  onGenerate,
}: {
  theme: Theme;
  onGenerate: (colors: string[]) => void;
}) {
  const [source, setSource] = useState("primary");
  const [custom, setCustom] = useState(theme.highlight);
  const seed = source === "custom" ? custom : theme[source as (typeof colorFields)[number]["key"]];
  const ready = hexColor.test(seed);

  return (
    <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="Starting color" htmlFor="sequential-seed">
          <div className="flex items-center gap-2">
            {source === "custom" ? (
              <input
                type="color"
                value={hexColor.test(custom) ? custom : "#000000"}
                onChange={(event) => setCustom(event.target.value.toUpperCase())}
                className="size-9 shrink-0 cursor-pointer rounded-md border bg-card p-1"
                aria-label="Custom starting color"
              />
            ) : (
              <span className="size-9 shrink-0 rounded-md border" style={{ background: seed }} aria-hidden />
            )}
            <SelectField
              id="sequential-seed"
              value={source}
              onValueChange={setSource}
              options={[
                ...colorFields.map((field) => ({ value: field.key, label: field.label })),
                { value: "custom", label: "Custom" },
              ]}
            />
          </div>
        </Field>
        <Button
          type="button"
          variant="outline"
          disabled={!ready}
          onClick={() => onGenerate(sequentialPaletteFrom(seed))}
        >
          Generate
        </Button>
      </div>
      {source === "custom" ? (
        <Input
          value={custom}
          onChange={(event) => setCustom(event.target.value.toUpperCase())}
          className="font-mono"
          aria-label="Custom starting color hex"
        />
      ) : null}
    </div>
  );
}

function PaletteEditor({
  label,
  colors,
  min,
  max,
  onChange,
  header,
}: {
  label: string;
  colors: string[];
  min: number;
  max: number;
  onChange: (colors: string[]) => void;
  header?: React.ReactNode;
}) {
  return (
    <Field label={label} hint={`${colors.length} colors · ${min} to ${max} required`}>
      <div className="grid gap-2">
        {header}
        {colors.map((color, index) => (
          <div key={`${label}-${index}`} className="flex items-center gap-2">
            <input
              type="color"
              value={hexColor.test(color) ? color : "#000000"}
              onChange={(event) => {
                const next = [...colors];
                next[index] = event.target.value.toUpperCase();
                onChange(next);
              }}
              className="size-9 shrink-0 cursor-pointer rounded-md border bg-card p-1"
              aria-label={`${label} ${index + 1}`}
            />
            <Input
              value={color}
              onChange={(event) => {
                const next = [...colors];
                next[index] = event.target.value.toUpperCase();
                onChange(next);
              }}
              className="font-mono"
              aria-label={`${label} ${index + 1} hex`}
            />
            {colors.length > min ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9"
                onClick={() => onChange(colors.filter((_, item) => item !== index))}
                aria-label={`Remove ${label} ${index + 1}`}
              >
                <MinusIcon />
              </Button>
            ) : null}
          </div>
        ))}
        {colors.length < max ? (
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => onChange([...colors, colors.at(-1) ?? "#001836"])}
          >
            <PlusIcon />
            Add color
          </Button>
        ) : null}
      </div>
    </Field>
  );
}

export function ThemeForm() {
  const tenant = useTenant();
  return <ThemeFields key={`${tenant.id}-${tenant.themeId}`} />;
}

function ThemeFields() {
  const tenant = useTenant();
  const themes = useQuery(themesQuery(tenant.id));
  const [draft, setDraft] = useState<Theme>(() => cloneTheme(tenant.theme));
  const apply = useActionMutation((themeId: string) => applyThemeAction(tenant.id, themeId));
  const save = useActionMutation(
    (next: Theme) =>
      saveThemeAction(tenant.id, next.tenantId ? next.id : null, {
        name: next.name,
        primary: next.primary,
        primaryForeground: next.primaryForeground,
        highlight: next.highlight,
        accent: next.accent,
        success: next.success,
        surface: next.surface,
        surfaceForeground: next.surfaceForeground,
        foreground: next.foreground,
        chartColor: next.chartColor,
        headingFont: next.headingFont,
        bodyFont: next.bodyFont,
        categoricalPalette: next.categoricalPalette,
        sequentialPalette: next.sequentialPalette,
        divergingPalette: next.divergingPalette,
      }),
    {
      invalidate: [keys.themes(tenant.id)],
      onSuccess: (theme) => {
        if (theme) {
          setDraft(cloneTheme(theme));
        }
      },
    },
  );
  const remove = useActionMutation((themeId: string) => deleteThemeAction(tenant.id, themeId));
  const catalog = themes.data ?? [tenant.theme];
  const cardRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const pin = useCardPin(cardRef, barRef);

  return (
    <Tabs defaultValue="colors">
      <TabsList variant="line">
        <TabsTrigger value="colors">Colors &amp; fonts</TabsTrigger>
        <TabsTrigger value="charts">Chart palettes</TabsTrigger>
      </TabsList>
      <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card ref={cardRef}>
          <CardHeader>
            <CardTitle>Themes</CardTitle>
            <CardDescription>
              Choose a global theme to fill the colors, then save a named theme for this tenant. Chart palettes stay
              with the theme.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 pb-28"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate(draft);
              }}
            >
              <TabsContent value="colors" keepMounted className="grid gap-4 sm:grid-cols-2">
                <Field label="Apply theme">
                  <SelectField
                    value={tenant.themeId}
                    onValueChange={(themeId) => {
                      const selected = catalog.find((theme) => theme.id === themeId);
                      if (selected) {
                        setDraft(cloneTheme(selected));
                      }

                      apply.mutate(themeId);
                    }}
                    options={catalog.map((theme) => ({
                      value: theme.id,
                      label: theme.tenantId ? theme.name : `${theme.name} (global)`,
                    }))}
                  />
                </Field>
                <Field label="Theme name" htmlFor="themeName">
                  <Input
                    id="themeName"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </Field>
                {colorFields.map((field) => {
                  const value = String(draft[field.key]);
                  return (
                    <Field key={field.key} label={field.label} htmlFor={field.key}>
                      <div className="flex items-center gap-2">
                        <input
                          id={field.key}
                          type="color"
                          value={hexColor.test(value) ? value : "#000000"}
                          onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value.toUpperCase() })}
                          className="size-9 shrink-0 cursor-pointer rounded-md border bg-card p-1"
                        />
                        <Input
                          value={value}
                          onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value.toUpperCase() })}
                          className="font-mono"
                        />
                      </div>
                    </Field>
                  );
                })}
                <Field label="Heading font">
                  <SelectField
                    value={draft.headingFont}
                    onValueChange={(headingFont) => setDraft({ ...draft, headingFont })}
                    options={fontOptions}
                  />
                </Field>
                <Field label="Body font">
                  <SelectField
                    value={draft.bodyFont}
                    onValueChange={(bodyFont) => setDraft({ ...draft, bodyFont })}
                    options={fontOptions}
                  />
                </Field>
              </TabsContent>
              <TabsContent value="charts" keepMounted className="grid gap-4">
                <Field label="Base chart color" htmlFor="chartColor" hint="Used by the single-color chart palette">
                  <div className="flex items-center gap-2">
                    <input
                      id="chartColor"
                      type="color"
                      value={hexColor.test(draft.chartColor) ? draft.chartColor : "#000000"}
                      onChange={(event) => setDraft({ ...draft, chartColor: event.target.value.toUpperCase() })}
                      className="size-9 shrink-0 cursor-pointer rounded-md border bg-card p-1"
                    />
                    <Input
                      value={draft.chartColor}
                      onChange={(event) => setDraft({ ...draft, chartColor: event.target.value.toUpperCase() })}
                      className="font-mono"
                    />
                  </div>
                </Field>
                <PaletteEditor
                  label="Categorical chart palette"
                  colors={draft.categoricalPalette}
                  min={6}
                  max={8}
                  onChange={(categoricalPalette) => setDraft({ ...draft, categoricalPalette })}
                />
                <PaletteEditor
                  label="Sequential chart palette"
                  colors={draft.sequentialPalette}
                  min={5}
                  max={10}
                  onChange={(sequentialPalette) => setDraft({ ...draft, sequentialPalette })}
                  header={
                    <SequentialPaletteGenerator
                      theme={draft}
                      onGenerate={(sequentialPalette) => setDraft({ ...draft, sequentialPalette })}
                    />
                  }
                />
                <PaletteEditor
                  label="Diverging chart palette"
                  colors={draft.divergingPalette}
                  min={7}
                  max={7}
                  onChange={(divergingPalette) => setDraft({ ...draft, divergingPalette })}
                />
              </TabsContent>
              <div
                ref={barRef}
                role="group"
                aria-label="Theme actions"
                className={`fixed z-30 flex flex-wrap gap-2 border-t bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_16px_-12px_rgb(0_0_0/0.35)] ${pin?.docked ? "rounded-b-xl" : ""}`}
                style={
                  pin
                    ? { left: pin.left, width: pin.width, top: pin.top, bottom: "auto" }
                    : { left: 0, right: 0, bottom: 0, visibility: "hidden" }
                }
              >
                <SubmitButton pending={save.isPending} >
                  Save theme
                </SubmitButton>
                {draft.tenantId ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(draft.id)}
                  >
                    Delete theme
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  disabled={apply.isPending}
                  onClick={() => {
                    const def = catalog.find((theme) => theme.id === clockedInTheme.id) ?? clockedInTheme;
                    setDraft(cloneTheme(def));
                    apply.mutate(def.id);
                  }}
                >
                  Reset to default
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <Card className="h-fit overflow-hidden py-0" style={brandStyle(draft)}>
          <div className="bg-sidebar px-4 py-5 text-sidebar-foreground">
            <p className="text-xs tracking-widest uppercase opacity-70">Preview</p>
            <p className="mt-1 font-heading text-lg font-semibold">{tenant.name}</p>
          </div>
          <div className="brand-rule" />
          <CardContent className="bg-card py-4 text-card-foreground">
            <p className="text-sm text-muted-foreground">Volunteer hours</p>
            <p className="text-2xl font-heading font-semibold text-highlight">12.5 h</p>
            <div className="mt-3 grid gap-2">
              <div className="flex gap-1">
                <span className="h-6 flex-1 rounded-sm" style={{ background: draft.chartColor }} />
              </div>
              {[draft.categoricalPalette, draft.sequentialPalette, draft.divergingPalette].map((palette, index) => (
                <div key={["categorical", "sequential", "diverging"][index]} className="flex gap-1">
                  {palette.map((color, colorIndex) => (
                    <span key={`${color}-${colorIndex}`} className="h-6 flex-1 rounded-sm" style={{ background: color }} />
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Tabs>
  );
}
