import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  Building2,
  FileCheck,
  FileText,
  Link as LinkIcon,
  LogIn,
  MessageSquare,
  Radar,
  Route,
  ScanSearch,
  Search,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { HeroPreview } from "@/components/landing/HeroPreview";
import { Reveal } from "@/components/landing/Reveal";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "#overview", label: "Overview" },
  { href: "#features", label: "Features" },
  { href: "#pages", label: "Pages" },
  { href: "#technology", label: "Technology" },
  { href: "#about", label: "About" },
];

const CAPABILITIES: Array<{ title: string; body: string; Icon: LucideIcon }> = [
  {
    title: "Evidence-First AI",
    body: "Every finding must cite source events. Claims the evidence does not support are rejected or flagged for review.",
    Icon: ScanSearch,
  },
  {
    title: "Live Multi-Agent Investigation",
    body: "Triage, Investigator, Verifier and Reporter agents work the case together, and their progress streams as it happens.",
    Icon: Bot,
  },
  {
    title: "Attack Story Reconstruction",
    body: "Connected entities and events are assembled into a timeline of how the attack progressed, step by step.",
    Icon: Route,
  },
  {
    title: "Tamper-Proof Chain of Custody",
    body: "A hash-chained ledger records ingestion, agent steps and reports, and is sealed with an ML-DSA signature.",
    Icon: LinkIcon,
  },
  {
    title: "Tanya SAKSI",
    body: "Ask about the case in Bahasa Melayu or English. Answers cite evidence IDs and separate verified points from hypotheses.",
    Icon: MessageSquare,
  },
  {
    title: "Commander's Brief",
    body: "A decision-ready report in BM or EN, with verified findings kept apart from AI interpretation.",
    Icon: FileText,
  },
];

const AGENT_STEPS: Array<{ name: string; action: string; body: string }> = [
  {
    name: "Triage Agent",
    action: "Detect & prioritise incidents",
    body: "Runs detection rules and an injection scanner over the logs, then sets the investigation scope.",
  },
  {
    name: "Investigator Agent",
    action: "Analyse & connect evidence",
    body: "Searches and pivots through events to connect hosts, accounts and IP addresses into candidate findings.",
  },
  {
    name: "Verifier Agent",
    action: "Validate findings with sources",
    body: "Checks each finding against its cited raw events and the ATT&CK technique list before it is accepted.",
  },
  {
    name: "Reporter Agent",
    action: "Generate actionable reports",
    body: "Writes the summary and recommended actions from verified findings only.",
  },
];

const PAGES: Array<{ number: string; title: string; body: string; to: string }> = [
  {
    number: "01",
    title: "Command Centre",
    body: "Active investigations, critical incidents, agent health and recent activity at a glance.",
    to: "/app",
  },
  {
    number: "02",
    title: "Investigation Workspace",
    body: "Three panels for case context, the attack relationship graph and entity details.",
    to: "/app/investigations",
  },
  {
    number: "03",
    title: "Agent Operations",
    body: "Each agent's state, current task, progress and execution log.",
    to: "/app/investigations",
  },
  {
    number: "04",
    title: "Evidence Explorer",
    body: "Search raw events, check their SHA-256 hashes and read their custody history.",
    to: "/app/investigations",
  },
  {
    number: "05",
    title: "Attack Story Replay",
    body: "Step through the attack timeline, with the evidence behind each step one click away.",
    to: "/app/investigations",
  },
  {
    number: "06",
    title: "Commander's Brief",
    body: "Generate the report in Bahasa Melayu or English and export it as PDF.",
    to: "/app/investigations",
  },
];

const BUILT_FOR: Array<{ title: string; body: string; Icon: LucideIcon }> = [
  { title: "SOC Analysts", body: "Triage incidents and see which evidence matters first.", Icon: Radar },
  { title: "Forensic Investigators", body: "Trace each claim back to the raw log line it came from.", Icon: Search },
  { title: "Commanders", body: "Read a decision-ready brief without going through raw logs.", Icon: Users },
  {
    title: "NC4 / NACSA Reporting",
    body: "Reports structured to support incident reporting to NC4 and NACSA.",
    Icon: FileCheck,
  },
];

const TECHNOLOGY: Array<{ label: string; caption: string }> = [
  { label: "Log ingestion", caption: "CSV, JSON and JSONL exports, hashed when received." },
  { label: "Normalisation", caption: "Web, Sysmon, SIEM and generic logs mapped to one event schema." },
  { label: "Triage Agent", caption: "Detection rules, an injection scanner and the scope statement." },
  { label: "Investigator Agent", caption: "Tool-based search and pivots over events, submitting findings." },
  { label: "Verifier Agent", caption: "Evidence, technique, entity and LLM support checks per finding." },
  { label: "Reporter Agent", caption: "Report built from verified findings, with recommended actions." },
  { label: "Evidence storage", caption: "Each case's files, events and findings stored per case." },
  { label: "Chain of custody", caption: "Hash-chained ledger of ingestion, agent steps and reports." },
  { label: "ML-DSA signature", caption: "ML-DSA-65 signature over the ledger head." },
];

function Section({
  id,
  eyebrow,
  title,
  children,
  className,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-20 border-t border-border", className)}>
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-20">
        <Reveal>
          <p className="font-mono text-xs tracking-wide text-cyan uppercase">{eyebrow}</p>
          <h2 id={`${id}-title`} className="mt-2 text-xl font-semibold tracking-tight text-text md:text-[22px]">
            {title}
          </h2>
        </Reveal>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/95">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-8">
        <Link to="/" aria-label="SAKSI home" className="flex items-center gap-2.5 rounded-sm">
          <LogoMark />
          <Wordmark />
        </Link>
        <nav aria-label="Page sections" className="flex w-full items-center gap-1 overflow-x-auto md:w-auto">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="shrink-0 rounded-md px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface hover:text-text"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto">
          <Button asChild variant="outline" size="md">
            <Link to="/app">
              <LogIn aria-hidden />
              Try Live Demo
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section
      id="overview"
      aria-labelledby="hero-title"
      className="scroll-mt-20 mx-auto grid max-w-7xl items-center gap-12 px-4 pt-12 pb-16 md:px-8 md:pt-20 lg:grid-cols-[1fr_1.05fr] lg:gap-16"
    >
      <div className="space-y-6">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-cyan">
          <ShieldCheck aria-hidden className="size-3.5" />
          AI Cyber Forensic Platform
        </span>
        <h1
          id="hero-title"
          className="text-[72px] leading-none font-semibold tracking-tight text-text sm:text-[104px] lg:text-[120px]"
        >
          SAKSI
        </h1>
        <div className="space-y-3">
          <p className="max-w-xl text-xl leading-snug font-medium text-text sm:text-2xl">
            AI Forensic <span className="text-cyan">Investigator</span> for Malaysian{" "}
            <span className="text-cyan">Cyber Defence</span>
          </p>
          <p className="text-base text-text-secondary italic">Penyiasat Forensik AI untuk Pertahanan Siber Malaysia</p>
        </div>
        <p className="font-mono text-sm text-green">{"> It investigates. It explains. It keeps the receipts."}</p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button asChild variant="primary" size="lg">
            <Link to="/app">
              Explore Platform
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="#pages">Watch Demo</a>
          </Button>
        </div>
      </div>
      <Reveal delay={120}>
        <HeroPreview />
      </Reveal>
    </section>
  );
}

function Why() {
  return (
    <Section id="why" eyebrow="01 · Why" title="Why SAKSI?" className="border-t-0">
      <div className="grid gap-6 md:grid-cols-2 md:gap-12">
        <p className="text-base leading-relaxed text-text">
          Security teams are handed raw logs and asked for an answer under time pressure. Most AI summaries cannot be
          checked, so an analyst cannot tell what the system actually saw from what it guessed.
        </p>
        <p className="text-base leading-relaxed text-text-secondary">
          SAKSI keeps the investigation explainable. Each finding links to the events behind it, a verifier checks those
          links, and every AI step is written to a ledger that anyone can verify later.
        </p>
      </div>
    </Section>
  );
}

function Features() {
  return (
    <Section id="features" eyebrow="02 · Capabilities" title="Key product capabilities">
      <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((item, index) => (
          <li key={item.title} className="list-none bg-surface p-5">
            <Reveal delay={index * 40} className="flex h-full flex-col gap-3">
              <item.Icon aria-hidden className="size-5 text-cyan" />
              <h3 className="text-sm font-semibold text-text">{item.title}</h3>
              <p className="text-sm leading-relaxed text-text-secondary">{item.body}</p>
            </Reveal>
          </li>
        ))}
      </ul>

      <div className="mt-16 space-y-6">
        <h3 className="text-lg font-semibold text-text">How It Works?</h3>
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {AGENT_STEPS.map((step, index) => (
            <li key={step.name} className="list-none rounded-md border border-border bg-surface p-5">
              <Reveal delay={index * 60} className="flex h-full flex-col gap-3">
                <span className="font-mono text-xs text-text-muted">0{index + 1}</span>
                <h4 className="text-sm font-semibold text-text">{step.name}</h4>
                <p className="text-xs font-medium text-green">{step.action}</p>
                <p className="text-sm leading-relaxed text-text-secondary">{step.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <ShieldCheck aria-hidden className="size-4 text-green" />
          Tamper-proof chain of custody for every AI step.
        </p>
      </div>
    </Section>
  );
}

function Pages() {
  return (
    <Section id="pages" eyebrow="03 · Application" title="Explore Our Pages">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PAGES.map((page, index) => (
          <li key={page.number} className="list-none">
            <Reveal delay={index * 40} className="h-full">
              <Link
                to={page.to}
                className="group flex h-full flex-col gap-3 rounded-md border border-border bg-surface p-5 transition-colors hover:border-text-muted"
              >
                <span className="flex items-center justify-between">
                  <span className="font-mono text-xs text-text-muted">{page.number}</span>
                  <ArrowRight aria-hidden className="size-4 text-text-muted transition-colors group-hover:text-cyan" />
                </span>
                <h3 className="text-sm font-semibold text-text">{page.title}</h3>
                <p className="text-sm leading-relaxed text-text-secondary">{page.body}</p>
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>

      <div className="mt-16 space-y-6">
        <h3 className="text-lg font-semibold text-text">Built For</h3>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BUILT_FOR.map((item) => (
            <li key={item.title} className="flex list-none gap-3 rounded-md border border-border bg-surface p-4">
              <item.Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-cyan" />
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-text">{item.title}</h4>
                <p className="text-sm text-text-secondary">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function Technology() {
  return (
    <Section id="technology" eyebrow="04 · Architecture" title="Technology">
      <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
        Logs move through ingestion and normalisation into four agents. Evidence and every agent step go into the
        chain of custody, which is signed. Only what is implemented is listed here.
      </p>
      <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TECHNOLOGY.map((item, index) => (
          <li key={item.label} className="list-none rounded-md border border-border bg-surface p-4">
            <Reveal delay={index * 30} className="flex gap-3">
              <span className="font-mono text-xs text-text-muted">{String(index + 1).padStart(2, "0")}</span>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-text">{item.label}</h3>
                <p className="text-xs leading-relaxed text-text-secondary">{item.caption}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function About() {
  return (
    <Section id="about" eyebrow="05 · About" title="About SAKSI">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-text">The problem</h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              Cyber incidents produce large volumes of logs. Working out what happened, which evidence supports it and
              what to report takes analysts hours, and unverifiable AI output adds risk rather than removing it.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-text">Why SAKSI was developed</h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              SAKSI explores how AI can help investigators without asking them to trust it: evidence-first findings,
              verifier checks and a recorded trail of every step.
            </p>
          </div>
        </div>
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-text">Intended users</h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              SOC analysts, forensic investigators, commanders who need decision-ready briefs, and staff who prepare
              national incident reports.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-text">Demonstration data</h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              The included scenario is simulated and labelled as such in the product. The landing page shows no live
              operational data.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-10 flex items-start gap-4 rounded-md border border-border bg-surface p-5">
        <Building2 aria-hidden className="mt-0.5 size-5 shrink-0 text-cyan" />
        <p className="text-sm leading-relaxed text-text-secondary">
          <span className="font-medium text-text">Developed by Universiti Teknologi MARA (UiTM), Faculty of Computer and
          Mathematical Sciences (FSKM).</span>{" "}
          Prepared for iHack 2026 Industrial Pitching.
        </p>
      </div>
    </Section>
  );
}

function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 py-16 md:flex-row md:items-center md:justify-between md:px-8">
        <Reveal>
          <h2 id="cta-title" className="text-xl font-semibold tracking-tight text-text md:text-[22px]">
            Open the workspace and follow an investigation from log to report.
          </h2>
        </Reveal>
        <Button asChild variant="primary" size="lg">
          <Link to="/app">
            Explore Platform
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-xs text-text-secondary md:flex-row md:flex-wrap md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-6" />
          <Wordmark className="text-sm" />
        </div>
        <p>Universiti Teknologi MARA · FSKM</p>
        <p className="text-text">Stronger Cyber Defence. A Safer Malaysia.</p>
        <p className="font-mono text-text-muted">iHack 2026 · Industrial Pitching · 17 November 2026</p>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <Header />
      <main>
        <Hero />
        <Why />
        <Features />
        <Pages />
        <Technology />
        <About />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
