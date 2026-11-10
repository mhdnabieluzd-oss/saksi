import { ExternalLink } from "lucide-react";

interface TechniqueChipProps {
  id: string;
  name: string;
  href: string;
  /** Framework name for the screen-reader note, such as "MITRE ATT&CK". */
  source: string;
}

/** Technique id and name linking to the framework page. Opens in a new tab. */
export function TechniqueChip({ id, name, href, source }: TechniqueChipProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-sm border border-cyan/30 bg-cyan/10 px-1.5 py-0.5 text-xs text-cyan transition-colors hover:bg-cyan/20 max-md:min-h-11"
    >
      <span className="font-mono">{id}</span>
      {name && <span className="min-w-0 truncate text-text-secondary">{name}</span>}
      <ExternalLink aria-hidden className="size-3 shrink-0" />
      <span className="sr-only">({source}, opens in a new tab)</span>
    </a>
  );
}
