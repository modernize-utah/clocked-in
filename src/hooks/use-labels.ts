"use client";

import { useTenant } from "@/hooks/use-workspace";
import { labels } from "@/lib/labels";

export function useLabels() {
  return labels(useTenant().preferences);
}
