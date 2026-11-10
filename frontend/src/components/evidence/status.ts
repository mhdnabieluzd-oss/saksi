import { Clock, ShieldCheck, ShieldX, type LucideIcon } from "lucide-react";
import type { StatusMeta } from "@/lib/format";
import type { SignatureStatus } from "@/lib/types";

const TONE_CLASS = {
  green: "text-green bg-green/10 border-green/30",
  red: "text-red bg-red/10 border-red/30",
  amber: "text-amber bg-amber/10 border-amber/30",
  muted: "text-text-muted bg-surface-elevated border-border",
} as const;

export type MetaTone = keyof typeof TONE_CLASS;

/** Label, icon and colour together. Never colour alone. */
export function statusMeta(label: string, tone: MetaTone, Icon: LucideIcon): StatusMeta {
  return { label, className: TONE_CLASS[tone], Icon };
}

export const CHECKING: StatusMeta = statusMeta("Checking", "muted", Clock);

/** Signature state: valid, invalid, or not sealed yet (the Reporter seals after verification). */
export function signatureStatusMeta(signature: SignatureStatus | undefined): StatusMeta {
  if (!signature) return CHECKING;
  if (signature.valid === true) return statusMeta("Valid", "green", ShieldCheck);
  if (signature.valid === false) return statusMeta("Invalid", "red", ShieldX);
  return statusMeta("Not sealed yet", "amber", Clock);
}
