import type { ReactNode } from "react";
import { FileText, ShieldCheck, ShieldQuestion, ShieldX } from "lucide-react";
import { AgentAvatar } from "@/components/agents/identity";
import { EvidenceChip } from "@/components/evidence-shared/EvidenceChip";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Hash } from "@/components/ui/hash";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Timestamp } from "@/components/ui/timestamp";
import { severityMeta } from "@/lib/format";
import type { Classification, Report } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CLASSIFICATION_BAND, COPY } from "./labels";

function ClassificationBanner({ classification }: { classification: Classification }) {
  return (
    <div
      role="note"
      aria-label={`Classification: ${classification}`}
      className={cn(
        "px-4 py-1.5 text-center text-xs font-semibold tracking-[0.2em] uppercase",
        CLASSIFICATION_BAND[classification],
      )}
    >
      {classification}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="border-b border-border pb-2 text-sm font-semibold tracking-wide text-text uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Items({ items, ordered = false, empty }: { items: string[]; ordered?: boolean; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-text-secondary">{empty}</p>;
  const List = ordered ? "ol" : "ul";
  return (
    <List className={cn("flex flex-col gap-2 pl-5 text-sm leading-relaxed text-text", ordered ? "list-decimal" : "list-disc")}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </List>
  );
}

export function ReportDocument({ report }: { report: Report }) {
  const copy = COPY[report.lang];
  const { custody } = report;
  const signatureText =
    custody.signature_valid === null
      ? copy.notChecked
      : custody.signature_valid
        ? copy.valid
        : copy.invalid;
  const isTemplate =
    report.model === "template" ||
    report.model.toLowerCase().includes("template") ||
    report.model.toLowerCase().includes("fallback");

  return (
    <article
      aria-label={report.title}
      lang={report.lang}
      className="mx-auto w-full max-w-3xl overflow-hidden rounded-md border border-border bg-surface-elevated"
    >
      <ClassificationBanner classification={report.classification} />

      <div className="flex flex-col gap-8 p-6 md:p-10">
        <header className="flex flex-col gap-3 border-b border-border pb-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs tracking-wide text-text-secondary uppercase">
              <AgentAvatar role="reporter" state="completed" size={24} />
              {copy.commander}
            </p>
            {isTemplate ? (
              <Badge tone="amber" title="Drafted by deterministic bilingual template">
                Template-generated report
              </Badge>
            ) : (
              <Badge tone="cyan">LLM-generated report</Badge>
            )}
          </div>
          <h2 className="text-xl font-semibold text-text md:text-2xl">{report.title}</h2>
          <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-text-secondary">{copy.caseId}</dt>
              <dd className="font-mono text-cyan">{report.case_id}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-text-secondary">{copy.generated}</dt>
              <dd>
                <Timestamp iso={report.generated_at} />
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-text-secondary">{copy.model}</dt>
              <dd className="font-mono break-all text-text">{report.model}</dd>
            </div>
          </dl>
        </header>

        <div className="rounded-md border border-cyan/40 bg-bg p-4">
          <p className="text-xs font-semibold tracking-wide text-cyan uppercase">{copy.bluf}</p>
          <p className="mt-2 text-base leading-relaxed text-text">{report.bluf}</p>
        </div>

        <Section id="sec-executive" title={copy.executive}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-text">{report.executive_summary}</p>
        </Section>

        <Section id="sec-overview" title={copy.overview}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-text">{report.incident_overview}</p>
        </Section>

        <Section id="sec-timeline" title={copy.timeline}>
          {report.timeline.length === 0 ? (
            <p className="text-sm text-text-secondary">{copy.none}</p>
          ) : (
            <Table label={copy.timeline}>
              <TableHeader>
                <tr>
                  <TableHead>{copy.time}</TableHead>
                  <TableHead>{copy.event}</TableHead>
                  <TableHead>{copy.evidence}</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {report.timeline.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="align-top">
                      <Timestamp iso={item.ts} />
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">{item.description}</TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {item.evidence_ids.map((id) => (
                          <EvidenceChip key={id} caseId={report.case_id} eventId={id} />
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>

        <Section id="sec-systems" title={copy.systems}>
          <Items items={report.affected_systems} empty={copy.none} />
        </Section>

        <Section id="sec-verified" title={copy.verified}>
          {report.verified_findings.length === 0 ? (
            <p className="text-sm text-text-secondary">{copy.none}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {report.verified_findings.map((finding) => (
                <li key={finding.finding_id} className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-medium text-text">{finding.title}</h4>
                    <Badge tone="green">
                      <ShieldCheck aria-hidden />
                      {copy.verifiedBadge}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="cyan" mono>
                      {copy.technique}: {finding.technique_id}
                    </Badge>
                    <span className="text-xs text-text-secondary">{finding.technique_name}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-text-secondary">{finding.summary}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {finding.evidence_ids.map((id) => (
                      <EvidenceChip key={id} caseId={report.case_id} eventId={id} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="sec-interpretations" title={copy.interpretations}>
          <Badge tone="amber" className="self-start">
            <ShieldQuestion aria-hidden />
            {copy.interpretationBadge}
          </Badge>
          <Items items={report.interpretations} empty={copy.none} />
        </Section>

        <Section id="sec-risk" title={copy.risk}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-text-secondary">{copy.riskLevel}</span>
            <StatusBadge meta={severityMeta(report.risk_level)} />
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-text">{report.risk_and_impact}</p>
        </Section>

        <Section id="sec-decisions" title={copy.decisions}>
          <Items items={report.decisions_needed} ordered empty={copy.none} />
        </Section>

        <Section id="sec-actions" title={copy.actions}>
          <Items items={report.recommended_actions} ordered empty={copy.none} />
        </Section>

        <Section id="sec-custody" title={copy.custody}>
          <dl className="grid gap-3 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
            <dt className="text-text-secondary">{copy.entries}</dt>
            <dd className="text-text tabular-nums">{custody.entries}</dd>
            <dt className="text-text-secondary">{copy.chain}</dt>
            <dd>
              {custody.chain_ok ? (
                <Badge tone="green">
                  <ShieldCheck aria-hidden />
                  {copy.chainOk}
                </Badge>
              ) : (
                <Badge tone="red">
                  <ShieldX aria-hidden />
                  {copy.chainBroken}
                </Badge>
              )}
            </dd>
            <dt className="text-text-secondary">{copy.headHash}</dt>
            <dd>
              <Hash value={custody.head_hash} n={16} />
            </dd>
            <dt className="text-text-secondary">{copy.signature}</dt>
            <dd className="flex flex-wrap items-center gap-2 text-text">
              <span className="font-mono text-xs">{custody.signature_algorithm}</span>
              <span className="text-text-secondary">· {signatureText}</span>
            </dd>
          </dl>
        </Section>

        <div className="flex flex-col gap-2 border-t border-border pt-6">
          <p className="flex items-center gap-2 text-xs text-text-secondary">
            <FileText aria-hidden className="size-3.5" />
            {copy.reportHash}
          </p>
          <Hash value={report.report_hash} n={24} />
        </div>
      </div>

      <ClassificationBanner classification={report.classification} />
    </article>
  );
}
