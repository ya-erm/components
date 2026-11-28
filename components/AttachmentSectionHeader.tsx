import { isPdfAttachment } from "@/lib/attachment-links";
import type { Attachment } from "@/lib/schema";
import { webcadFormat } from "@/lib/webcad-preview";
import { ChevronDownIcon, CubeIcon } from "./ui/Field";

export const attachmentSectionClass = "flex min-h-12 items-center gap-2";

/** Shared by the cached preview, loading skeleton and interactive form. */
export function AttachmentSectionHeader({ files }: { files?: readonly Attachment[] }) {
  return <>
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6v20h12V6Z" /><path d="M14 2v5h5M9 12h6M9 16h6" /></svg>
    <span role="heading" aria-level={2} className="text-lg font-semibold">Файлы</span>
    {files === undefined ? <span aria-hidden="true" className="h-4 w-4 animate-pulse rounded bg-[var(--color-surface-2)]" /> : <span className="text-sm text-[var(--color-muted)]">{files.length}</span>}
    {files?.some((file) => webcadFormat(file.name)) ? <span role="img" aria-label="Есть 3D-модели" title="Есть 3D-модели" className="shrink-0 text-indigo-600 dark:text-indigo-300">
      <CubeIcon className="size-4" />
    </span> : null}
    {files?.some(isPdfAttachment) ? <span title="Есть PDF-файлы" className="shrink-0 text-[11px] font-semibold text-red-600 dark:text-red-300">PDF</span> : null}
    <ChevronDownIcon className="ml-auto size-5 shrink-0 text-[var(--color-muted)] transition-transform group-open:rotate-180" />
  </>;
}
