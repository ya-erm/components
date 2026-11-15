import type { Attachment } from "@/lib/schema";

export function DownloadIcon({ className = "size-[18px]" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
  </svg>;
}

export function AttachmentDownload({ file }: { file: Pick<Attachment, "id" | "name"> }) {
  return <a href={`/api/files/${file.id}`} aria-label={`Скачать ${file.name}`} title={`Скачать ${file.name}`}
    className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]">
    <DownloadIcon />
  </a>;
}
