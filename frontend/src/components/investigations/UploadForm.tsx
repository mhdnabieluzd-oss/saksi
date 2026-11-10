import { useId, useState, type DragEvent, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/format";
import { useUpload } from "@/lib/queries";
import type { CaseSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_FILES, validateUploadFiles } from "./uploadRules";

const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(",");

export function UploadForm({ onCreated }: { onCreated: (created: CaseSummary) => void }) {
  const upload = useUpload();
  const titleId = useId();
  const titleErrorId = useId();
  const inputId = useId();
  const fileErrorId = useId();
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function acceptFiles(list: FileList | File[]) {
    const picked = Array.from(list);
    const error = validateUploadFiles(picked);
    setFileError(error);
    if (!error) setFiles(picked);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFiles(event.dataTransfer.files);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError("Enter a case title.");
      return;
    }
    setTitleError(null);
    const error = validateUploadFiles(files);
    if (error) {
      setFileError(error);
      return;
    }
    upload.mutate({ files, title: trimmed }, { onSuccess: onCreated });
  }

  return (
    <Card title="Upload logs" description={`1 to ${MAX_UPLOAD_FILES} files, ${ACCEPTED_EXTENSIONS.join(" ")}, max 25 MB each.`}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={titleId} className="text-sm font-medium text-text">
            Case title
          </label>
          <Input
            id={titleId}
            value={title}
            maxLength={120}
            placeholder="e.g. Branch network breach, 3 Nov"
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? titleErrorId : undefined}
            disabled={upload.isPending}
            onChange={(event) => setTitle(event.target.value)}
          />
          {titleError && (
            <p id={titleErrorId} className="text-xs text-red">
              {titleError}
            </p>
          )}
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-colors",
            dragging ? "border-cyan bg-cyan/5" : "border-border",
          )}
        >
          <Upload aria-hidden className="size-5 text-text-muted" />
          <p className="text-sm text-text">Drag log files here</p>
          <input
            id={inputId}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            disabled={upload.isPending}
            aria-describedby={fileErrorId}
            className="peer sr-only"
            onChange={(event) => {
              if (event.target.files) acceptFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <label
            htmlFor={inputId}
            className="inline-flex h-10 cursor-pointer items-center rounded-md border border-border bg-surface-elevated px-4 text-sm font-medium text-text transition-colors hover:border-text-muted peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan max-md:min-h-11"
          >
            Choose files
          </label>
          <p className="text-xs text-text-muted">.csv, .json, .jsonl, .txt, .log</p>
        </div>

        {fileError && (
          <p id={fileErrorId} role="alert" className="text-sm text-red">
            {fileError}
          </p>
        )}

        {files.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {files.map((file) => (
              <li key={file.name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate font-mono text-xs text-text">{file.name}</span>
                <span className="shrink-0 text-xs text-text-secondary tabular-nums">{formatBytes(file.size)}</span>
              </li>
            ))}
          </ul>
        )}

        {upload.isPending ? (
          <Spinner label={`Uploading ${files.length} file(s) and normalising events`} />
        ) : (
          <Button type="submit" variant="primary" className="self-start" disabled={files.length === 0}>
            Create case from uploads
          </Button>
        )}

        {upload.isError && <ErrorState title="Upload failed" message={upload.error.message} />}
      </form>
    </Card>
  );
}
