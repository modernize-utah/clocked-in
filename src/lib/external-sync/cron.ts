import { CronExpressionParser } from "cron-parser";

const fiveField = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/;

export function isValidCronExpression(value: string) {
  const trimmed = value.trim();
  if (!fiveField.test(trimmed)) {
    return false;
  }

  try {
    // cron-parser accepts 5-field expressions without `strict` (strict expects seconds).
    CronExpressionParser.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/** True when the cron should fire in the minute window ending at `now` (inclusive of that minute). */
export function cronDueInWindow(expression: string, now: Date, lastPulledAt: Date | null) {
  try {
    const interval = CronExpressionParser.parse(expression.trim(), {
      currentDate: new Date(now.getTime() - 60_000),
      endDate: now,
    });
    const next = interval.next().toDate();
    if (lastPulledAt && next.getTime() <= lastPulledAt.getTime()) {
      return false;
    }

    return next.getTime() <= now.getTime();
  } catch {
    return false;
  }
}
