import { useSettings } from "@/lib/queries";

/** Analyst name from settings, falling back to "Analyst" while loading or offline. */
export function useAnalystName(): string {
  const settings = useSettings();
  return settings.data?.analyst_name?.trim() || "Analyst";
}
