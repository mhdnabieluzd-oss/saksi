/** MITRE ATT&CK technique page: T1003.001 -> .../techniques/T1003/001/, T1190 -> .../techniques/T1190/. */
export function attackTechniqueUrl(id: string): string {
  const [base, sub] = id.split(".");
  return sub
    ? `https://attack.mitre.org/techniques/${base}/${sub}/`
    : `https://attack.mitre.org/techniques/${base}/`;
}

/** MITRE ATLAS technique page for AI-specific attacks, such as AML.T0051. */
export function atlasTechniqueUrl(id: string): string {
  return `https://atlas.mitre.org/techniques/${id}`;
}
