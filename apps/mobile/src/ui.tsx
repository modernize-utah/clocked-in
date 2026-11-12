import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon, type LucideIcon } from "lucide-react-native";
import { createElement, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/api/client";
import {
  dateRangePresetLabel,
  formatDate,
  presetForRange,
  rangeForPreset,
  shiftDate,
  today as todayDate,
  type DateRange,
  type DateRangePreset,
} from "@/format";
import { alpha, useColors } from "@/theme";

export { formatMinutes } from "@/format";

export const today = todayDate;

export function messageFrom(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function hoursToMinutes(value: string) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return Math.round(hours * 60);
}

export const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, monospace" });

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const colors = useColors();
  if (!scroll) return <View style={[styles.screen, { backgroundColor: colors.canvas }]}>{children}</View>;
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.canvas }}
    >
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.title, { color: colors.foreground }]}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return <Text style={[styles.small, { color: colors.mutedForeground }, style as object]}>{children}</Text>;
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>;
}

export function PanelHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.panelHeader}>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.row}>
          {Icon ? <Icon color={colors.mutedForeground} size={16} /> : null}
          <Text style={[styles.panelTitle, { color: colors.cardForeground }]}>{title}</Text>
        </View>
        {description ? <Text style={[styles.small, { color: colors.mutedForeground }]}>{description}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function PageTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {description ? <Text style={[styles.small, { color: colors.mutedForeground }]}>{description}</Text> : null}
      </View>
      {action}
    </View>
  );
}

/** A card with a header and padded body, like the website's Card. */
export function Section({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Panel>
      <PanelHeader action={action} description={description} icon={icon} title={title} />
      {children ? <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 14 }}>{children}</View> : null}
    </Panel>
  );
}

export function ListRow({
  title,
  detail,
  right,
  onPress,
}: {
  title: string;
  detail?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const colors = useColors();
  const body = (
    <View style={[styles.listRow, { borderColor: colors.border }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.cardForeground, fontSize: 15, fontWeight: "500" }}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={2} style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { backgroundColor: colors.muted } : null)}>
      {body}
    </Pressable>
  );
}

/** The website's small-screen section switcher: the current section, opening a menu of the rest. */
export function SectionNav<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { id: T; label: string; icon: LucideIcon }[];
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const active = items.find((item) => item.id === value) ?? items[0];
  if (!active) return null;
  return (
    <Menu
      items={items.map((item) => ({ label: item.label, icon: item.icon, checked: item.id === active.id, onPress: () => onChange(item.id) }))}
      trigger={(show) => (
        <Pressable
          accessibilityLabel="Sections"
          accessibilityRole="button"
          onPress={show}
          style={[styles.input, styles.selectTrigger, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <active.icon color={colors.foreground} size={16} />
          <Text style={{ flex: 1, color: colors.foreground, fontSize: 14, fontWeight: "500" }}>{active.label}</Text>
          <ChevronDownIcon color={colors.mutedForeground} size={16} />
        </Pressable>
      )}
      width={Math.min(width - 32, 728)}
    />
  );
}

export function Divider() {
  const colors = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

export function Input({ style, mono: monospace, ...input }: TextInputProps & { mono?: boolean }) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      autoCapitalize="none"
      placeholderTextColor={colors.mutedForeground}
      {...input}
      onBlur={(event) => {
        setFocused(false);
        input.onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        input.onFocus?.(event);
      }}
      style={[
        styles.input,
        {
          borderColor: focused ? colors.primary : colors.input,
          color: colors.foreground,
          backgroundColor: colors.card,
        },
        monospace ? { fontFamily: mono, textAlign: "center" } : null,
        input.multiline ? { minHeight: 64, paddingTop: 10, textAlignVertical: "top" } : null,
        style,
      ]}
    />
  );
}

export function FormField({
  label,
  hint,
  error,
  action,
  children,
  style,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  action?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <View style={[styles.field, style]}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
        <View style={{ flex: 1 }} />
        {action}
      </View>
      {children}
      {error ? <Text style={[styles.hint, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

export function Field({
  label,
  hint,
  error,
  value,
  onChangeText,
  ...input
}: {
  label: string;
  hint?: string;
  error?: string | null;
  value: string;
  onChangeText: (value: string) => void;
} & TextInputProps) {
  return (
    <FormField error={error} hint={hint} label={label}>
      <Input accessibilityLabel={label} onChangeText={onChangeText} value={value} {...input} />
    </FormField>
  );
}

type ButtonVariant = "default" | "outline" | "ghost" | "destructive" | "secondary";

export function Button({
  label,
  onPress,
  disabled,
  pending,
  secondary,
  variant,
  icon: Icon,
  filledIcon,
  size = "default",
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  pending?: boolean;
  secondary?: boolean;
  variant?: ButtonVariant;
  icon?: LucideIcon;
  filledIcon?: boolean;
  size?: "default" | "sm" | "lg";
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const kind: ButtonVariant = variant ?? (secondary ? "outline" : "default");
  const palette = {
    default: { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary },
    destructive: { bg: colors.destructive, fg: "#FFFFFF", border: colors.destructive },
    outline: { bg: colors.card, fg: colors.foreground, border: colors.border },
    secondary: { bg: colors.secondary, fg: colors.foreground, border: colors.secondary },
    ghost: { bg: "transparent", fg: colors.foreground, border: "transparent" },
  }[kind];
  const height = { sm: 32, default: 40, lg: 44 }[size];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || pending}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: height,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled || pending ? 0.5 : pressed ? 0.85 : 1,
          paddingHorizontal: size === "sm" ? 10 : 16,
        },
        style,
      ]}
    >
      {pending ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : Icon ? (
        <Icon color={palette.fg} fill={filledIcon ? palette.fg : "none"} size={16} />
      ) : null}
      <Text style={[styles.buttonText, { color: palette.fg, fontSize: size === "sm" ? 13 : 14 }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  color,
  size = 36,
  style,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: 10, alignItems: "center", justifyContent: "center" },
        pressed ? { backgroundColor: colors.muted } : null,
        style,
      ]}
    >
      <Icon color={color ?? colors.foreground} size={18} />
    </Pressable>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  const colors = useColors();
  if (!error) return null;
  return (
    <View style={[styles.alert, { borderColor: alpha(colors.destructive, 0.3), backgroundColor: alpha(colors.destructive, 0.06) }]}>
      <Text style={{ color: colors.destructive, fontSize: 13 }}>{typeof error === "string" ? error : messageFrom(error)}</Text>
    </View>
  );
}

export function Card({
  title,
  detail,
  onPress,
  right,
}: {
  title: string;
  detail?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const colors = useColors();
  const body = (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.cardForeground }]}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={2} style={[styles.small, { color: colors.mutedForeground }]}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress ? <ChevronRightIcon color={colors.mutedForeground} size={16} /> : null}
    </View>
  );
  if (!onPress) return body;
  return <Pressable onPress={onPress}>{body}</Pressable>;
}

export function Badge({ label, tone = "outline" }: { label: string; tone?: "outline" | "secondary" | "success" }) {
  const colors = useColors();
  const palette =
    tone === "success"
      ? { bg: alpha(colors.success, 0.14), fg: colors.foreground, border: "transparent" }
      : tone === "secondary"
        ? { bg: colors.secondary, fg: colors.foreground, border: "transparent" }
        : { bg: "transparent", fg: colors.foreground, border: colors.border };
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={{ color: palette.fg, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { id: T; label: string }[];
}) {
  const colors = useColors();
  return (
    <View accessibilityRole="tablist" style={[styles.tabs, { borderColor: colors.border }]}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={item.id}
            onPress={() => onChange(item.id)}
            style={[styles.tab, { borderColor: active ? colors.foreground : "transparent" }]}
          >
            <Text style={{ color: active ? colors.foreground : colors.mutedForeground, fontWeight: active ? "600" : "500", fontSize: 14 }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleGroup<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { id: T; label: string }[];
}) {
  const colors = useColors();
  return (
    <View style={[styles.toggleGroup, { borderColor: colors.border }]}>
      {items.map((item, index) => {
        const active = item.id === value;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            key={item.id}
            onPress={() => onChange(item.id)}
            style={[
              styles.toggle,
              { backgroundColor: active ? colors.muted : colors.card, borderColor: colors.border },
              index > 0 ? { borderLeftWidth: 1 } : null,
            ]}
          >
            <Text style={{ color: colors.foreground, fontWeight: active ? "600" : "500", fontSize: 14 }}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  scroll = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.sheetRoot}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.4)" }]} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, maxHeight: height * 0.85, paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <View style={{ gap: 4, paddingHorizontal: 20, paddingBottom: 12 }}>
            <Text style={[styles.panelTitle, { color: colors.cardForeground }]}>{title}</Text>
            {description ? <Text style={[styles.small, { color: colors.mutedForeground }]}>{description}</Text> : null}
          </View>
          {scroll ? (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            <View style={{ paddingHorizontal: 20, gap: 14, flexShrink: 1 }}>{children}</View>
          )}
        </View>
      </View>
    </Modal>
  );
}

export type SelectOption = { value: string; label: string; group?: string };

export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = "Select",
  searchable,
  createLabel,
  onCreate,
}: {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  createLabel?: string;
  onCreate?: () => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text ? options.filter((option) => option.label.toLowerCase().includes(text)) : options;
  }, [options, query]);

  const trigger = (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={() => setOpen(true)}
      style={[styles.input, styles.selectTrigger, { borderColor: colors.input, backgroundColor: colors.card }]}
    >
      <Text numberOfLines={1} style={{ flex: 1, color: selected ? colors.foreground : colors.mutedForeground, fontSize: 15 }}>
        {selected?.label ?? placeholder}
      </Text>
      <ChevronDownIcon color={colors.mutedForeground} size={16} />
    </Pressable>
  );

  return (
    <>
      {label ? <FormField label={label}>{trigger}</FormField> : trigger}
      <Sheet
        onClose={() => {
          setOpen(false);
          setQuery("");
        }}
        open={open}
        scroll={false}
        title={label || placeholder}
      >
        {searchable && options.length > 6 ? (
          <View style={[styles.input, styles.selectTrigger, { borderColor: colors.input }]}>
            <SearchIcon color={colors.mutedForeground} size={16} />
            <TextInput
              autoCapitalize="none"
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={colors.mutedForeground}
              style={{ flex: 1, color: colors.foreground, fontSize: 15, minHeight: 38 }}
              value={query}
            />
          </View>
        ) : null}
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
          {filtered.map((option, index) => {
            const header = option.group && option.group !== filtered[index - 1]?.group ? option.group : null;
            const active = option.value === value;
            return (
              <View key={option.value}>
                {header ? <Text style={[styles.menuLabel, { color: colors.mutedForeground }]}>{header}</Text> : null}
                <Pressable
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    { backgroundColor: active ? colors.accent : pressed ? colors.muted : "transparent" },
                  ]}
                >
                  <Text style={{ flex: 1, color: colors.foreground, fontSize: 15, fontWeight: active ? "600" : "400" }}>{option.label}</Text>
                  {active ? <CheckIcon color={colors.foreground} size={16} /> : null}
                </Pressable>
              </View>
            );
          })}
          {filtered.length === 0 ? <Muted>No matches.</Muted> : null}
          {onCreate && createLabel ? (
            <Pressable
              onPress={() => {
                setOpen(false);
                onCreate();
              }}
              style={styles.option}
            >
              <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "600" }}>+ {createLabel}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </Sheet>
    </>
  );
}

export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <Select
      label={label}
      onChange={onChange}
      options={options.map((option) => ({ value: option.id, label: option.label }))}
      placeholder="Choose"
      value={value}
    />
  );
}

export type MenuItem =
  | { kind?: "item"; label: string; icon?: LucideIcon; onPress: () => void; destructive?: boolean; checked?: boolean; leading?: ReactNode }
  | { kind: "separator" }
  | { kind: "label"; label: string };

/** A dropdown anchored under its trigger, like the website's DropdownMenu. */
export function Menu({
  trigger,
  items,
  header,
  align = "start",
  width = 256,
}: {
  trigger: (open: () => void) => ReactNode;
  items: MenuItem[];
  header?: ReactNode;
  align?: "start" | "end";
  width?: number;
}) {
  const colors = useColors();
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const { width: screenWidth } = useWindowDimensions();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  function open() {
    anchor.current?.measureInWindow((x, y, w, h) => {
      const left = align === "end" ? x + w - width : x;
      setPosition({ top: y + h + 6, left: Math.max(8, Math.min(left, screenWidth - width - 8)) });
    });
  }

  const close = () => setPosition(null);

  return (
    <>
      <View collapsable={false} ref={anchor}>
        {trigger(open)}
      </View>
      <Modal animationType="fade" onRequestClose={close} transparent visible={position !== null}>
        <Pressable accessibilityLabel="Close menu" onPress={close} style={StyleSheet.absoluteFill} />
        {position ? (
          <View
            style={[
              styles.menu,
              { top: position.top, left: position.left, width, backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {header}
            {items.map((item, index) => {
              if (item.kind === "separator") {
                return <View key={index} style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 }} />;
              }
              if (item.kind === "label") {
                return (
                  <Text key={index} style={[styles.menuLabel, { color: colors.mutedForeground }]}>
                    {item.label}
                  </Text>
                );
              }
              const Icon = item.icon;
              const color = item.destructive ? colors.destructive : colors.foreground;
              return (
                <Pressable
                  key={index}
                  onPress={() => {
                    close();
                    item.onPress();
                  }}
                  style={({ pressed }) => [styles.menuItem, pressed ? { backgroundColor: colors.muted } : null]}
                >
                  {item.leading ?? (Icon ? <Icon color={item.destructive ? colors.destructive : colors.mutedForeground} size={16} /> : null)}
                  <Text numberOfLines={1} style={{ flex: 1, color, fontSize: 14 }}>
                    {item.label}
                  </Text>
                  {item.checked ? <CheckIcon color={colors.foreground} size={16} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Modal>
    </>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  pending,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const colors = useColors();
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={open}>
      <View style={styles.dialogRoot}>
        <Pressable onPress={onCancel} style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.4)" }]} />
        <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.panelTitle, { color: colors.cardForeground }]}>{title}</Text>
          {description ? <Text style={[styles.small, { color: colors.mutedForeground }]}>{description}</Text> : null}
          {children}
          <View style={styles.dialogActions}>
            <Button label="Cancel" onPress={onCancel} variant="outline" />
            <Button label={confirmLabel} onPress={onConfirm} pending={pending} variant={destructive ? "destructive" : "default"} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function DateField({
  label,
  value,
  onChange,
  max = todayDate(),
  action,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: string;
  action?: ReactNode;
}) {
  const colors = useColors();
  if (Platform.OS === "web") {
    return (
      <FormField action={action} label={label}>
        {createElement("input", {
          "aria-label": label,
          type: "date",
          value,
          max,
          onChange: (event: { target: { value: string } }) => event.target.value && onChange(event.target.value),
          style: webInputStyle(colors.input, colors.foreground, colors.card),
        })}
      </FormField>
    );
  }
  return (
    <FormField action={action} label={label}>
      <View style={[styles.input, styles.selectTrigger, { borderColor: colors.input, backgroundColor: colors.card, paddingHorizontal: 4 }]}>
        <IconButton icon={ChevronLeftIcon} label="Previous day" onPress={() => onChange(shiftDate(value, -1))} size={32} />
        <Text style={{ flex: 1, textAlign: "center", color: colors.foreground, fontSize: 15 }}>{formatDate(value)}</Text>
        <IconButton
          color={value >= max ? colors.border : colors.foreground}
          icon={ChevronRightIcon}
          label="Next day"
          onPress={() => value < max && onChange(shiftDate(value, 1))}
          size={32}
        />
      </View>
    </FormField>
  );
}

const dateRangeOptions = (["all", "today", "week", "month", "last30", "year", "custom"] as const).map((id) => ({
  value: id,
  label: dateRangePresetLabel(id),
}));

export function DateRangeField({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const preset = presetForRange(value);
  return (
    <View style={{ gap: 12 }}>
      <Select
        label="Date range"
        onChange={(next) => {
          const chosen = next as DateRangePreset;
          if (chosen === "custom") {
            onChange(value.from || value.to ? value : { from: todayDate(), to: todayDate() });
            return;
          }
          onChange(rangeForPreset(chosen));
        }}
        options={dateRangeOptions}
        value={preset}
      />
      {preset === "custom" ? (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <DateField label="From" max="9999-12-31" onChange={(from) => onChange({ ...value, from })} value={value.from ?? todayDate()} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField label="To" max="9999-12-31" onChange={(to) => onChange({ ...value, to })} value={value.to ?? todayDate()} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function TimeField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  const colors = useColors();
  if (Platform.OS === "web") {
    return (
      <FormField error={error} label={label}>
        {createElement("input", {
          "aria-label": label,
          type: "time",
          value,
          onChange: (event: { target: { value: string } }) => onChange(event.target.value),
          style: webInputStyle(colors.input, colors.foreground, colors.card),
        })}
      </FormField>
    );
  }
  return (
    <FormField error={error} hint="24h" label={label}>
      <Input keyboardType="numbers-and-punctuation" mono onChangeText={onChange} placeholder="09:00" value={value} />
    </FormField>
  );
}

function webInputStyle(border: string, color: string, background: string) {
  return {
    height: 40,
    borderRadius: 10,
    border: `1px solid ${border}`,
    padding: "0 12px",
    fontSize: 15,
    color,
    background,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    boxSizing: "border-box" as const,
    width: "100%",
  };
}

export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description?: string }) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
        <Icon color={colors.mutedForeground} size={20} />
      </View>
      <Text style={[styles.cardTitle, { color: colors.foreground, textAlign: "center" }]}>{title}</Text>
      {description ? <Text style={[styles.small, { color: colors.mutedForeground, textAlign: "center" }]}>{description}</Text> : null}
    </View>
  );
}

export function Loading() {
  const colors = useColors();
  return (
    <View style={[styles.loading, { backgroundColor: colors.canvas }]}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 48, width: "100%", maxWidth: 760, alignSelf: "center" },
  title: { fontSize: 24, fontWeight: "600", letterSpacing: -0.4 },
  subtitle: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  panel: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  panelHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, paddingBottom: 12 },
  panelTitle: { fontSize: 16, fontWeight: "600" },
  field: { gap: 6 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { fontSize: 14, fontWeight: "500" },
  hint: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 10, minHeight: 40, paddingHorizontal: 12, fontSize: 15 },
  selectTrigger: { flexDirection: "row", alignItems: "center", gap: 8 },
  button: { borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, flexDirection: "row", gap: 8 },
  buttonText: { fontWeight: "600" },
  alert: { borderWidth: 1, borderRadius: 10, padding: 10 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  card: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 10, flexDirection: "row", alignItems: "center" },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, gap: 20 },
  tab: { paddingVertical: 10, borderBottomWidth: 2, marginBottom: -1 },
  toggleGroup: { flexDirection: "row", borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  toggle: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, width: "100%", maxWidth: 640, alignSelf: "center" },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  option: { flexDirection: "row", alignItems: "center", minHeight: 44, paddingHorizontal: 12, borderRadius: 10, gap: 8 },
  menu: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 38, paddingHorizontal: 10, borderRadius: 8 },
  menuLabel: { fontSize: 12, fontWeight: "500", paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 },
  dialogRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  dialog: { width: "100%", maxWidth: 440, borderRadius: 16, borderWidth: 1, padding: 20, gap: 10 },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 28, paddingHorizontal: 16 },
  emptyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 200 },
});
