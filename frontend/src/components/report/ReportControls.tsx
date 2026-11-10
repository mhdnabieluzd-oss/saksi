import { CircleAlert, FileDown, LoaderCircle, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reportPdfUrl } from "@/lib/api";
import type { Classification, Lang } from "@/lib/types";
import { CLASSIFICATIONS, LANG_LABEL } from "./labels";

const LANGUAGES: readonly Lang[] = ["ms", "en"];

interface ReportControlsProps {
  caseId: string;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  classification: Classification;
  onClassificationChange: (classification: Classification) => void;
  canGenerate: boolean;
  generating: boolean;
  onGenerate: () => void;
  hasReport: boolean;
  verifying: boolean;
  onVerify: () => void;
  verifyMatch: boolean | null;
}

export function ReportControls({
  caseId,
  lang,
  onLangChange,
  classification,
  onClassificationChange,
  canGenerate,
  generating,
  onGenerate,
  hasReport,
  verifying,
  onVerify,
  verifyMatch,
}: ReportControlsProps) {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <span id="report-language-label" className="text-xs font-medium text-text-secondary">
              Language
            </span>
            <div role="group" aria-labelledby="report-language-label" className="inline-flex rounded-md border border-border p-0.5">
              {LANGUAGES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={lang === option}
                  onClick={() => onLangChange(option)}
                  className={
                    lang === option
                      ? "h-8 rounded-sm bg-surface-elevated px-3 text-sm font-medium text-cyan max-md:h-11"
                      : "h-8 rounded-sm px-3 text-sm text-text-secondary transition-colors hover:text-text max-md:h-11"
                  }
                >
                  {LANG_LABEL[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span id="report-classification-label" className="text-xs font-medium text-text-secondary">
              Classification
            </span>
            <Select value={classification} onValueChange={(value) => onClassificationChange(value as Classification)}>
              <SelectTrigger aria-labelledby="report-classification-label" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICATIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={!canGenerate} onClick={onGenerate}>
            {generating && <LoaderCircle aria-hidden className="animate-spin" />}
            {generating ? "Generating" : "Generate report"}
          </Button>
          {hasReport ? (
            <Button asChild variant="outline">
              <a href={reportPdfUrl(caseId, lang)} download>
                <FileDown aria-hidden />
                Export PDF
              </a>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              <FileDown aria-hidden />
              Export PDF
            </Button>
          )}
          <Button variant="secondary" disabled={!hasReport || verifying} onClick={onVerify}>
            {verifying && <LoaderCircle aria-hidden className="animate-spin" />}
            Verify report hash
          </Button>
        </div>
      </div>

      {verifyMatch !== null && (
        <div role="status" className="flex items-center gap-2 text-sm">
          {verifyMatch ? (
            <Badge tone="green">
              <ShieldCheck aria-hidden />
              Hash matches the stored report
            </Badge>
          ) : (
            <Badge tone="red">
              <ShieldX aria-hidden />
              Hash mismatch: the report may have changed
            </Badge>
          )}
        </div>
      )}

      {!canGenerate && !generating && (
        <p className="flex items-center gap-2 text-xs text-text-secondary">
          <CircleAlert aria-hidden className="size-3.5 shrink-0" />
          Generate needs a completed investigation run, so the report has verified findings to cite.
        </p>
      )}
    </div>
  );
}
