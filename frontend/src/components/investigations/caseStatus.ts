import { CircleCheck, CircleDashed, CircleX, LoaderCircle } from "lucide-react";
import type { StatusMeta } from "@/lib/format";
import type { CaseStatus } from "@/lib/types";

const CASE_STATUS_META: Record<CaseStatus, StatusMeta> = {
  new: {
    label: "New",
    className: "text-text-secondary bg-surface-elevated border-border",
    Icon: CircleDashed,
  },
  running: {
    label: "Running",
    className: "text-cyan bg-cyan/10 border-cyan/30",
    Icon: LoaderCircle,
  },
  completed: {
    label: "Completed",
    className: "text-green bg-green/10 border-green/30",
    Icon: CircleCheck,
  },
  failed: {
    label: "Failed",
    className: "text-red bg-red/10 border-red/30",
    Icon: CircleX,
  },
};

export function caseStatusMeta(status: CaseStatus): StatusMeta {
  return CASE_STATUS_META[status];
}
