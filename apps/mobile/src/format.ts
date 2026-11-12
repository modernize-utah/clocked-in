const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const longDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export function formatCurrency(value: number) {
  return currency.format(value);
}

export function formatNumber(value: number) {
  return number.format(value);
}

/** Large values become 3.5k or 3.4m. Smaller values keep their full precision. */
export function formatCompact(value: number) {
  const abs = Math.abs(value);
  const unit = [
    { divisor: 1_000_000, suffix: "m" },
    { divisor: 1_000, suffix: "k" },
  ].find((item) => abs >= item.divisor);
  if (!unit) return number.format(value);
  const scaled = Math.floor((abs / unit.divisor) * 10 + 1e-6) / 10;
  return `${value < 0 ? "-" : ""}${Number.isInteger(scaled) ? scaled : scaled.toFixed(1)}${unit.suffix}`;
}

export function formatHours(hours: number) {
  return `${number.format(hours)} h`;
}

export function formatMinutes(minutes: number | null) {
  if (minutes === null) return "--:--";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Whole minutes as `H:MM`, such as `1:30` or `999:00`. */
export function formatDurationInput(minutes: number) {
  const whole = Math.max(0, Math.trunc(minutes));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Reads `HH:MM` or decimal hours (`1.5`) as whole minutes. */
export function minutesFromDurationInput(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  const clock = /^(\d{1,3}):([0-5]?\d)$/.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  if (!/^\d{1,3}(\.\d+)?$/.test(text)) return null;
  const hours = Number(text);
  if (!Number.isFinite(hours)) return null;
  return Math.round(hours * 60);
}

export function formatClock(ms: number) {
  const total = Math.floor(ms / 1000);
  const parts = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}

export function fromDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toDateOnly(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function today() {
  return toDateOnly(new Date());
}

export function shiftDate(value: string, days: number) {
  const date = fromDateOnly(value);
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}

export function formatDate(value: string) {
  return longDate.format(fromDateOnly(value));
}

export type DateRange = { from?: string; to?: string };

const dateRangePresets = {
  all: "All time",
  today: "Today",
  week: "This week",
  month: "This month",
  last30: "Last 30 days",
  year: "This year",
  custom: "Custom range",
} as const;

export type DateRangePreset = keyof typeof dateRangePresets;

export function dateRangePresetLabel(preset: DateRangePreset) {
  return dateRangePresets[preset];
}

export function rangeForPreset(preset: DateRangePreset): DateRange {
  const now = new Date();
  const start = new Date(now);
  switch (preset) {
    case "today":
      return { from: toDateOnly(now), to: toDateOnly(now) };
    case "week":
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      return { from: toDateOnly(start) };
    case "month":
      return { from: toDateOnly(new Date(now.getFullYear(), now.getMonth(), 1)) };
    case "last30":
      start.setDate(now.getDate() - 29);
      return { from: toDateOnly(start) };
    case "year":
      return { from: toDateOnly(new Date(now.getFullYear(), 0, 1)) };
    default:
      return {};
  }
}

export function presetForRange(range: DateRange): DateRangePreset {
  if (!range.from && !range.to) return "all";
  const match = (Object.keys(dateRangePresets) as DateRangePreset[]).find(
    (key) => key !== "custom" && key !== "all" && range.from === rangeForPreset(key).from && range.to === rangeForPreset(key).to,
  );
  return match ?? "custom";
}

export function rangeLabel(range: DateRange) {
  const preset = presetForRange(range);
  if (preset !== "custom") return dateRangePresets[preset];
  if (range.from && range.to && range.from === range.to) return formatDate(range.from);
  if (range.from && range.to) return `${formatDate(range.from)} – ${formatDate(range.to)}`;
  if (range.from) return `Since ${formatDate(range.from)}`;
  if (range.to) return `Through ${formatDate(range.to)}`;
  return dateRangePresets.custom;
}

export function dayLabel(value: string) {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (value === toDateOnly(now)) return "Today";
  if (value === toDateOnly(yesterday)) return "Yesterday";
  return formatDate(value);
}

export function formatTime(value: string | null) {
  return value ? time.format(new Date(value)) : "";
}

/** Local `HH:MM` for an instant, or the fallback when there is none. */
export function localTime(value: string | null, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatPersonName(person: {
  username: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const display = person.displayName?.trim();
  if (display) return display;
  const full = [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
  return full || person.username;
}
