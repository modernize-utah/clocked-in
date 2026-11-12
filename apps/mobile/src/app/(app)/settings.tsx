import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import { BuildingIcon, ImageIcon, ListTreeIcon, MailIcon, NetworkIcon, PaletteIcon } from "lucide-react-native";
import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { api } from "@/api/client";
import type { Project, Theme } from "@/api/types";
import { useColors } from "@/theme";
import {
  Button,
  ConfirmDialog,
  ErrorText,
  Field,
  Input,
  ListRow,
  Menu,
  Muted,
  PageTitle,
  Panel,
  PanelHeader,
  Screen,
  Section,
  SectionNav,
  Select,
  Sheet,
} from "@/ui";
import { useLookups, useOrgQuery, useWorkspace } from "@/workspace";

type SettingsView = "organization" | "departments" | "lists" | "theme" | "brand" | "email";

const themeKeys = [
  { key: "primary", label: "Primary" },
  { key: "primaryForeground", label: "Primary text" },
  { key: "highlight", label: "Highlight" },
  { key: "accent", label: "Accent" },
  { key: "success", label: "Success" },
  { key: "surface", label: "Surface" },
  { key: "surfaceForeground", label: "Surface text" },
  { key: "foreground", label: "Foreground" },
] as const;

type ThemeColors = Record<(typeof themeKeys)[number]["key"], string>;

const emailToggles = [
  ["FeedbackReceived", "Feedback received"],
  ["FeedbackNotify", "Feedback assigned"],
  ["FeedbackCompleted", "Feedback completed"],
  ["AccessRequestReceived", "Access request received"],
  ["AccessRequestDecided", "Access request decided"],
  ["NeedSubmitted", "Need submitted"],
  ["NeedDecided", "Need decided"],
  ["VolunteerMessage", "Volunteer message"],
] as const;

const frequencies = [
  { value: "immediate", label: "Immediate" },
  { value: "weekly", label: "Weekly" },
  { value: "off", label: "Off" },
];

function webOrigin() {
  return (process.env.EXPO_PUBLIC_WEB_URL || process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:3025").replace(/\/$/, "");
}

function mix(from: string, to: string, t: number) {
  const channel = (hex: string, index: number) => parseInt(hex.slice(index, index + 2), 16);
  const part = (index: number) => Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * t)
    .toString(16)
    .padStart(2, "0");
  return `#${part(1)}${part(3)}${part(5)}`;
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => Promise<unknown> }) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Input autoCapitalize="words" onChangeText={setValue} placeholder={placeholder} value={value} />
      </View>
      <Button
        disabled={value.trim().length < 1}
        label="Add"
        onPress={() => {
          setPending(true);
          onAdd(value.trim())
            .then(() => setValue(""))
            .finally(() => setPending(false));
        }}
        pending={pending}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const { organization, labels, isAdmin, isCoordinator } = useWorkspace();
  const { lookups } = useLookups();
  const client = useQueryClient();
  const [view, setView] = useState<SettingsView>(isAdmin ? "organization" : "lists");
  const departments = useOrgQuery("departments", (organizationId) => api.departments(organizationId), view === "departments" || view === "lists");
  const categories = useOrgQuery("categories", (organizationId) => api.categories(organizationId), view === "lists");
  const tags = useOrgQuery("tags", (organizationId) => api.tags(organizationId), view === "lists");
  const projects = useOrgQuery("projects", (organizationId) => api.projects(organizationId), view === "lists");
  const rates = useOrgQuery("rates", (organizationId) => api.hourlyRates(organizationId), view === "organization");
  const themes = useOrgQuery("themes", (organizationId) => api.themes(organizationId), view === "theme");
  const members = useOrgQuery("members", (organizationId) => api.memberships(organizationId), view === "organization");
  const [name, setName] = useState(organization.name);
  const [description, setDescription] = useState(organization.description ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(organization.websiteUrl ?? "");
  const [slug, setSlug] = useState(organization.slug ?? "");
  const [publicSlug, setPublicSlug] = useState(organization.publicSlug ?? "");
  const [organizationLabel, setOrganizationLabel] = useState(labels.organization);
  const [projectLabel, setProjectLabel] = useState(labels.project);
  const [departmentLabel, setDepartmentLabel] = useState(labels.department);
  const [categoryLabel, setCategoryLabel] = useState(labels.taskCategory);
  const [notifyIds, setNotifyIds] = useState<string[]>(organization.preferences.feedbackNotifyUserIds ?? []);
  const [theme, setTheme] = useState<ThemeColors>(() => Object.fromEntries(themeKeys.map(({ key }) => [key, organization.theme[key]])) as ThemeColors);
  const [headingFont, setHeadingFont] = useState(organization.theme.headingFont);
  const [bodyFont, setBodyFont] = useState(organization.theme.bodyFont);
  const [categorical, setCategorical] = useState(organization.theme.categoricalPalette.join(", "));
  const [sequentialFrom, setSequentialFrom] = useState(organization.theme.sequentialPalette[0] ?? "#e8eef5");
  const [sequentialTo, setSequentialTo] = useState(organization.theme.sequentialPalette.at(-1) ?? organization.theme.primary);
  const [sequential, setSequential] = useState(organization.theme.sequentialPalette.join(", "));
  const [diverging, setDiverging] = useState(organization.theme.divergingPalette.join(", "));
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [rename, setRename] = useState<{ kind: "department" | "category" | "tag"; id: string; name: string } | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [confirmBulk, setConfirmBulk] = useState<null | { kind: "departments" | "categories" | "tags"; ids: string[] }>(null);
  const email = organization.preferences.emailSettings ?? {};

  async function refresh(message = "") {
    setError(null);
    setSaved(message);
    await Promise.all(
      ["departments", "categories", "tags", "projects", "lookups", "rates", "themes"].map((key) =>
        client.invalidateQueries({ queryKey: [key, organization.id] }),
      ),
    );
    await client.invalidateQueries({ queryKey: ["workspace"] });
  }

  const saveOrg = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.updateOrganization(organization.id, body),
    onSuccess: () => refresh("Saved."),
    onError: setError,
  });

  const palette = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

  const saveTheme = useMutation({
    mutationFn: () =>
      api.saveTheme(organization.id, organization.theme.id, organization.theme.organizationId === organization.id, {
        name: organization.theme.name,
        ...theme,
        chartColor: theme.primary,
        headingFont: headingFont.trim() || organization.theme.headingFont,
        bodyFont: bodyFont.trim() || organization.theme.bodyFont,
        categoricalPalette: palette(categorical),
        sequentialPalette: palette(sequential),
        divergingPalette: palette(diverging),
      }),
    onSuccess: () => refresh("Theme saved."),
    onError: setError,
  });

  const add = (create: (organizationId: string, name: string) => Promise<unknown>) => (value: string) =>
    create(organization.id, value).then(() => refresh()).catch(setError);

  function preferences(patch: Record<string, unknown>) {
    return { preferences: { ...organization.preferences, ...patch } };
  }

  async function pickBrand(kind: "mark" | "wordmark" | "wordmarkOnLight") {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setError(null);
    try {
      await api.uploadBrand(organization.id, kind, {
        uri: asset.uri,
        name: asset.fileName ?? `${kind}.png`,
        type: asset.mimeType ?? "image/png",
      });
      await refresh("Brand updated.");
    } catch (caught) {
      setError(caught);
    }
  }

  async function removeMany(kind: "departments" | "categories" | "tags", ids: string[]) {
    await Promise.all(
      ids.map((id) =>
        kind === "departments" ? api.deleteDepartment(id) : kind === "categories" ? api.deleteCategory(id) : api.deleteTag(id),
      ),
    );
    setSelected([]);
    setConfirmBulk(null);
    await refresh("Deleted.");
  }

  const showListsOnly = isCoordinator && !isAdmin;

  return (
    <Screen>
      <PageTitle title="Settings" />
      <SectionNav
        items={[
          ...(isAdmin ? [{ id: "organization" as const, label: labels.organization, icon: BuildingIcon }] : []),
          ...(isAdmin ? [{ id: "departments" as const, label: labels.departments, icon: NetworkIcon }] : []),
          { id: "lists" as const, label: `${labels.projects} & lists`, icon: ListTreeIcon },
          ...(isAdmin ? [{ id: "theme" as const, label: "Themes", icon: PaletteIcon }] : []),
          ...(isAdmin ? [{ id: "brand" as const, label: "Brand", icon: ImageIcon }] : []),
          ...(isAdmin ? [{ id: "email" as const, label: "Email", icon: MailIcon }] : []),
        ]}
        onChange={(next) => {
          setSaved("");
          setSelected([]);
          setView(next);
        }}
        value={showListsOnly ? "lists" : view}
      />
      <ErrorText error={error} />
      {saved ? <Text style={{ color: colors.success, fontSize: 13 }}>{saved}</Text> : null}

      {view === "organization" && isAdmin ? (
        <>
          <Section icon={BuildingIcon} title="General">
            <Field autoCapitalize="words" label="Name" onChangeText={setName} value={name} />
            <Field label="Description" multiline onChangeText={setDescription} value={description} />
            <Field keyboardType="url" label="Website" onChangeText={setWebsiteUrl} value={websiteUrl} />
            <Field autoCapitalize="none" label="White-label slug" onChangeText={setSlug} value={slug} />
            <Field autoCapitalize="none" label="Openings slug" onChangeText={setPublicSlug} value={publicSlug} />
            <Field label={`${labels.organization} label`} onChangeText={setOrganizationLabel} value={organizationLabel} />
            <Field label={`${labels.project} label`} onChangeText={setProjectLabel} value={projectLabel} />
            <Field label={`${labels.department} label`} onChangeText={setDepartmentLabel} value={departmentLabel} />
            <Field label={`${labels.taskCategory} label`} onChangeText={setCategoryLabel} value={categoryLabel} />
            <Button
              label="Save"
              onPress={() =>
                saveOrg.mutate({
                  name: name.trim(),
                  description: description.trim() || null,
                  websiteUrl: websiteUrl.trim() || null,
                  slug: slug.trim() || null,
                  publicSlug: publicSlug.trim() || null,
                  ...preferences({
                    entityLabels: {
                      organization: organizationLabel.trim(),
                      project: projectLabel.trim(),
                      department: departmentLabel.trim(),
                      taskCategory: categoryLabel.trim(),
                    },
                    feedbackNotifyUserIds: notifyIds,
                  }),
                })
              }
              pending={saveOrg.isPending}
            />
          </Section>
          <ToggleRow
            description="Volunteers can change the date, start, and duration of their saved entries."
            label="Allow time entry editing"
            onChange={(allowTimeEntryEditing) => saveOrg.mutate(preferences({ allowTimeEntryEditing }))}
            value={organization.preferences.allowTimeEntryEditing}
          />
          <ToggleRow
            description="Volunteers can add people they are connected to."
            label="Volunteers can add volunteers"
            onChange={(allowVolunteersToAddVolunteers) => saveOrg.mutate(preferences({ allowVolunteersToAddVolunteers }))}
            value={organization.preferences.allowVolunteersToAddVolunteers}
          />
          <Panel>
            <PanelHeader description="These people are emailed when feedback arrives." title="Feedback recipients" />
            {(members.data?.items ?? []).filter((member) => member.isActive).map((member) => {
              const on = notifyIds.includes(member.userId);
              return (
                <ListRow
                  key={member.id}
                  onPress={() => setNotifyIds((current) => (on ? current.filter((id) => id !== member.userId) : [...current, member.userId]))}
                  right={<Text>{on ? "✓" : ""}</Text>}
                  title={member.user.displayName || member.user.email}
                />
              );
            })}
          </Panel>
          <Panel>
            <PanelHeader title="Hourly rates" />
            <RateForm onCreate={(body) => api.createHourlyRate(organization.id, body).then(() => refresh())} />
            {(rates.data?.items ?? lookups?.hourlyRates ?? []).map((rate) => (
              <ListRow
                detail={`${rate.type} · ${rate.perHourRate}${rate.isDefault ? " · default" : ""}${rate.isArchived ? " · archived" : ""}`}
                key={rate.id}
                right={
                  <Menu
                    align="end"
                    items={[
                      { label: "Set default", onPress: () => void api.updateHourlyRate(rate.id, { isDefault: true }).then(() => refresh()).catch(setError) },
                      { label: rate.isArchived ? "Restore" : "Archive", onPress: () => void api.updateHourlyRate(rate.id, { isArchived: !rate.isArchived }).then(() => refresh()).catch(setError) },
                      { label: "Delete", destructive: true, onPress: () => void api.deleteHourlyRate(rate.id).then(() => refresh()).catch(setError) },
                    ]}
                    trigger={(open) => <Button label="Edit" onPress={open} variant="ghost" />}
                  />
                }
                title={rate.name}
              />
            ))}
          </Panel>
        </>
      ) : null}

      {view === "departments" && isAdmin ? (
        <NamedList
          addPlaceholder={`New ${labels.department.toLowerCase()}`}
          items={departments.data?.items ?? []}
          onAdd={add((id, value) => api.createDepartment(id, value))}
          onBulk={(ids) => setConfirmBulk({ kind: "departments", ids })}
          onDelete={(id) => void api.deleteDepartment(id).then(() => refresh()).catch(setError)}
          onRename={(id, current) => setRename({ kind: "department", id, name: current })}
          selected={selected}
          setSelected={setSelected}
          title={labels.departments}
        />
      ) : null}

      {view === "lists" ? (
        <>
          <Panel>
            <PanelHeader title={labels.projects} />
            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              <AddRow onAdd={add((id, title) => api.createProject(id, { title, accessType: "Private", projectType: "Project" }))} placeholder={`New ${labels.project.toLowerCase()}`} />
            </View>
            {projects.data?.items.map((item) => (
              <ListRow
                detail={`${item.projectType} · ${item.isActive ? item.accessType : "archived"}`}
                key={item.id}
                onPress={() => setProject(item)}
                title={item.title}
              />
            ))}
          </Panel>
          <NamedList
            addPlaceholder={`New ${labels.taskCategory.toLowerCase()}`}
            items={categories.data?.items ?? []}
            onAdd={add((id, value) => api.createCategory(id, value))}
            onBulk={(ids) => setConfirmBulk({ kind: "categories", ids })}
            onDelete={(id) => void api.deleteCategory(id).then(() => refresh()).catch(setError)}
            onRename={(id, current) => setRename({ kind: "category", id, name: current })}
            selected={selected}
            setSelected={setSelected}
            title={labels.taskCategories}
          />
          <NamedList
            addPlaceholder="New tag"
            items={tags.data?.items ?? []}
            onAdd={add((id, value) => api.createTag(id, value))}
            onBulk={(ids) => setConfirmBulk({ kind: "tags", ids })}
            onDelete={(id) => void api.deleteTag(id).then(() => refresh()).catch(setError)}
            onRename={(id, current) => setRename({ kind: "tag", id, name: current })}
            selected={selected}
            setSelected={setSelected}
            title="Tags"
          />
        </>
      ) : null}

      {view === "theme" && isAdmin ? (
        <Section description="Eight colours, fonts, and chart palettes. The preview uses the colours you type." icon={PaletteIcon} title={organization.theme.name}>
          <View style={{ padding: 16, borderRadius: 12, backgroundColor: /^#[0-9a-f]{6}$/i.test(theme.surface) ? theme.surface : colors.card, gap: 8 }}>
            <Text style={{ color: /^#[0-9a-f]{6}$/i.test(theme.foreground) ? theme.foreground : colors.foreground, fontSize: 18 }}>{headingFont || "Heading"}</Text>
            <Text style={{ color: /^#[0-9a-f]{6}$/i.test(theme.surfaceForeground) ? theme.surfaceForeground : colors.mutedForeground }}>Body preview</Text>
            <View style={{ alignSelf: "flex-start", backgroundColor: /^#[0-9a-f]{6}$/i.test(theme.primary) ? theme.primary : colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: /^#[0-9a-f]{6}$/i.test(theme.primaryForeground) ? theme.primaryForeground : "#fff" }}>Button</Text>
            </View>
          </View>
          {(themes.data?.items ?? []).map((item) => (
            <ListRow
              detail={item.id === organization.theme.id ? "Applied" : item.organizationId ? "Custom" : "Built in"}
              key={item.id}
              onPress={() => void saveOrg.mutateAsync({ themeId: item.id }).then(() => refresh("Theme applied."))}
              title={item.name}
            />
          ))}
          {themeKeys.map(({ key, label }) => (
            <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: /^#[0-9a-f]{6}$/i.test(theme[key]) ? theme[key] : "transparent" }} />
              <Text style={{ flex: 1, color: colors.foreground, fontSize: 14 }}>{label}</Text>
              <View style={{ width: 120 }}>
                <Input autoCapitalize="characters" mono onChangeText={(value) => setTheme((current) => ({ ...current, [key]: value }))} value={theme[key]} />
              </View>
            </View>
          ))}
          <Field label="Heading font" onChangeText={setHeadingFont} value={headingFont} />
          <Field label="Body font" onChangeText={setBodyFont} value={bodyFont} />
          <Field label="Categorical palette" onChangeText={setCategorical} value={categorical} />
          <Field label="Sequential from" onChangeText={setSequentialFrom} value={sequentialFrom} />
          <Field label="Sequential to" onChangeText={setSequentialTo} value={sequentialTo} />
          <Button
            label="Generate sequential"
            onPress={() => {
              if (!/^#[0-9a-f]{6}$/i.test(sequentialFrom) || !/^#[0-9a-f]{6}$/i.test(sequentialTo)) return;
              setSequential(Array.from({ length: 7 }, (_, index) => mix(sequentialFrom, sequentialTo, index / 6)).join(", "));
            }}
            variant="outline"
          />
          <Field label="Sequential palette" onChangeText={setSequential} value={sequential} />
          <Field label="Diverging palette" onChangeText={setDiverging} value={diverging} />
          <Button label="Save theme" onPress={() => saveTheme.mutate()} pending={saveTheme.isPending} />
          <Button
            label="Reset"
            onPress={() => {
              setTheme(Object.fromEntries(themeKeys.map(({ key }) => [key, organization.theme[key]])) as ThemeColors);
              setHeadingFont(organization.theme.headingFont);
              setBodyFont(organization.theme.bodyFont);
              setCategorical(organization.theme.categoricalPalette.join(", "));
              setSequential(organization.theme.sequentialPalette.join(", "));
              setDiverging(organization.theme.divergingPalette.join(", "));
            }}
            variant="outline"
          />
          {organization.theme.organizationId === organization.id ? (
            <Button label="Delete theme" onPress={() => void api.deleteTheme(organization.id, organization.theme.id).then(() => refresh("Theme deleted.")).catch(setError)} variant="ghost" />
          ) : null}
        </Section>
      ) : null}

      {view === "brand" && isAdmin ? (
        <Section description="Favicon is the mark. The logo is the wordmark." icon={ImageIcon} title="Brand">
          <Button label="Upload favicon" onPress={() => void pickBrand("mark")} />
          <Button label="Upload logo" onPress={() => void pickBrand("wordmark")} variant="outline" />
          <Button label="Upload logo for light backgrounds" onPress={() => void pickBrand("wordmarkOnLight")} variant="outline" />
          <Button label="Remove favicon" onPress={() => void api.deleteBrand(organization.id, "mark").then(() => refresh()).catch(setError)} variant="ghost" />
          <Button label="Remove logo" onPress={() => void api.deleteBrand(organization.id, "wordmark").then(() => refresh()).catch(setError)} variant="ghost" />
        </Section>
      ) : null}

      {view === "email" && isAdmin ? (
        <Section description="How often mail goes out. Templates stay on the website." icon={MailIcon} title="Email delivery">
          <Select
            label="Logged time"
            onChange={(LoggedTime) => saveOrg.mutate(preferences({ emailSettings: { ...email, LoggedTime } }))}
            options={frequencies}
            value={String(email.LoggedTime ?? "immediate")}
          />
          <Select
            label="Unclassified entries"
            onChange={(UnclassifiedEntry) => saveOrg.mutate(preferences({ emailSettings: { ...email, UnclassifiedEntry } }))}
            options={frequencies}
            value={String(email.UnclassifiedEntry ?? "immediate")}
          />
          {emailToggles.map(([key, label]) => (
            <ToggleRow
              key={key}
              label={label}
              onChange={(value) => saveOrg.mutate(preferences({ emailSettings: { ...email, [key]: value } }))}
              value={email[key] !== false}
            />
          ))}
          <Button label="Edit templates on the web" onPress={() => void WebBrowser.openBrowserAsync(`${webOrigin()}/settings/email`)} variant="outline" />
        </Section>
      ) : null}

      <Sheet onClose={() => setRename(null)} open={Boolean(rename)} title="Rename">
        <Field label="Name" onChangeText={(value) => setRename((current) => (current ? { ...current, name: value } : current))} value={rename?.name ?? ""} />
        <Button
          label="Save"
          onPress={() => {
            if (!rename) return;
            const action =
              rename.kind === "department"
                ? api.updateDepartment(rename.id, rename.name.trim())
                : rename.kind === "category"
                  ? api.updateCategory(rename.id, rename.name.trim())
                  : api.updateTag(rename.id, rename.name.trim());
            void action.then(() => { setRename(null); return refresh(); }).catch(setError);
          }}
        />
      </Sheet>
      {project ? (
        <ProjectEditor
          key={project.id}
          departments={departments.data?.items ?? []}
          onClose={() => setProject(null)}
          onDelete={(id) => void api.deleteProject(id).then(() => { setProject(null); return refresh(); }).catch(setError)}
          onSave={(id, body) => void api.updateProject(id, body).then(() => { setProject(null); return refresh(); }).catch(setError)}
          project={project}
        />
      ) : null}
      <ConfirmDialog
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmBulk(null)}
        onConfirm={() => { if (confirmBulk) void removeMany(confirmBulk.kind, confirmBulk.ids).catch(setError); }}
        open={Boolean(confirmBulk)}
        title="Delete selected"
      />
    </Screen>
  );
}

function ToggleRow({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (value: boolean) => void }) {
  const colors = useColors();
  return (
    <Panel>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.cardForeground, fontSize: 15, fontWeight: "600" }}>{label}</Text>
          {description ? <Muted>{description}</Muted> : null}
        </View>
        <Switch onValueChange={onChange} thumbColor={colors.card} trackColor={{ false: colors.border, true: colors.primary }} value={value} />
      </View>
    </Panel>
  );
}

function NamedList({
  title,
  items,
  addPlaceholder,
  onAdd,
  onRename,
  onDelete,
  onBulk,
  selected,
  setSelected,
}: {
  title: string;
  items: { id: string; name: string }[];
  addPlaceholder: string;
  onAdd: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onBulk: (ids: string[]) => void;
  selected: string[];
  setSelected: (ids: string[]) => void;
}) {
  const mine = selected.filter((id) => items.some((item) => item.id === id));
  return (
    <Panel>
      <PanelHeader
        action={mine.length ? <Button label="Delete selected" onPress={() => onBulk(mine)} variant="ghost" /> : null}
        title={title}
      />
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <AddRow onAdd={onAdd} placeholder={addPlaceholder} />
      </View>
      {items.map((item) => {
        const on = selected.includes(item.id);
        return (
          <ListRow
            key={item.id}
            onPress={() => setSelected(on ? selected.filter((id) => id !== item.id) : [...selected, item.id])}
            right={
              <Menu
                align="end"
                items={[
                  { label: "Rename", onPress: () => onRename(item.id, item.name) },
                  { label: "Delete", destructive: true, onPress: () => onDelete(item.id) },
                ]}
                trigger={(open) => <Button label="Edit" onPress={open} variant="ghost" />}
              />
            }
            title={`${on ? "✓ " : ""}${item.name}`}
          />
        );
      })}
    </Panel>
  );
}

function RateForm({ onCreate }: { onCreate: (body: { name: string; type: string; perHourRate: number; isDefault?: boolean }) => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("Volunteer");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <View style={{ gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
      <Field label="Name" onChangeText={setName} value={name} />
      <Select label="Type" onChange={setType} options={[{ value: "Volunteer", label: "Volunteer" }, { value: "Professional", label: "Professional" }]} value={type} />
      <Field keyboardType="decimal-pad" label="Per hour" onChangeText={setAmount} value={amount} />
      <Button
        disabled={!name.trim() || Number(amount) <= 0}
        label="Add rate"
        onPress={() => {
          setPending(true);
          onCreate({ name: name.trim(), type, perHourRate: Number(amount) })
            .then(() => { setName(""); setAmount(""); })
            .finally(() => setPending(false));
        }}
        pending={pending}
      />
    </View>
  );
}

function ProjectEditor({
  project,
  departments,
  onClose,
  onSave,
  onDelete,
}: {
  project: Project;
  departments: { id: string; name: string }[];
  onClose: () => void;
  onSave: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(project.title);
  const [type, setType] = useState(project.projectType || "Project");
  const [departmentId, setDepartmentId] = useState(project.departmentId ?? "");
  const [startDate, setStartDate] = useState(project.startDate ?? "");
  const [endDate, setEndDate] = useState(project.endDate ?? "");
  return (
    <Sheet onClose={onClose} open title="Edit">
      <Field label="Title" onChangeText={setTitle} value={title} />
      <Select label="Type" onChange={setType} options={[{ value: "Project", label: "Project" }, { value: "Event", label: "Event" }]} value={type} />
      <Select
        label="Group"
        onChange={setDepartmentId}
        options={[{ value: "", label: "None" }, ...departments.map((item) => ({ value: item.id, label: item.name }))]}
        value={departmentId}
      />
      <Field label="Start date" onChangeText={setStartDate} placeholder="YYYY-MM-DD" value={startDate} />
      <Field label="End date" onChangeText={setEndDate} placeholder="YYYY-MM-DD" value={endDate} />
      <Button
        label="Save"
        onPress={() =>
          onSave(project.id, {
            title: title.trim(),
            projectType: type,
            departmentId: departmentId || null,
            startDate: startDate || null,
            endDate: endDate || null,
          })
        }
      />
      <Button label={project.isActive ? "Archive" : "Restore"} onPress={() => onSave(project.id, { isActive: !project.isActive })} variant="outline" />
      <Button label="Delete" onPress={() => onDelete(project.id)} variant="ghost" />
    </Sheet>
  );
}
