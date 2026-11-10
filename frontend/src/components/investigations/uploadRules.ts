import { formatBytes } from "@/lib/format";

export const MAX_UPLOAD_FILES = 3;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".csv", ".json", ".jsonl", ".txt", ".log"] as const;

/** Returns a user-facing message for the first problem found, or null when the selection is valid. */
export function validateUploadFiles(files: File[]): string | null {
  if (files.length === 0) return "Choose at least one file.";
  if (files.length > MAX_UPLOAD_FILES) return `Upload at most ${MAX_UPLOAD_FILES} files at a time.`;
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      return `"${file.name}" is not a supported type. Use ${ACCEPTED_EXTENSIONS.join(", ")}.`;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return `"${file.name}" is ${formatBytes(file.size)}. The limit is 25 MB per file.`;
    }
  }
  return null;
}
