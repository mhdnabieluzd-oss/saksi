export type TextPart = { kind: "text"; value: string } | { kind: "evidence"; id: string };

// Matches EV-00042 with or without the surrounding square brackets the model sometimes adds.
const EVIDENCE_TOKEN = /\[?(EV-\d{5})\]?/g;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

/** Splits answer text into plain runs and evidence IDs, so IDs can become chips. */
export function splitEvidence(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(EVIDENCE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ kind: "text", value: text.slice(last, index) });
    parts.push({ kind: "evidence", id: match[1] });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });
  return parts;
}

/** Distinct IPv4 addresses found in the given excerpts, in first-seen order. */
export function extractIps(texts: string[]): string[] {
  const seen = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(IPV4)) seen.add(match[0]);
  }
  return [...seen];
}
