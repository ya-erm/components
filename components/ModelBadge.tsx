import type { Attachment } from "@/lib/schema";
import { webcadFormat } from "@/lib/webcad-preview";

export function ModelBadge({ files, compact = false }: { files?: Attachment[]; compact?: boolean }) {
  if (!files?.some((file) => webcadFormat(file.name))) return null;
  return <span role="img" aria-label="Есть 3D-модель" title="Есть 3D-модель"
    className={`pointer-events-none absolute z-10 flex items-center justify-center rounded-md bg-white/95 text-indigo-600 shadow-sm ring-1 ring-black/5 ${compact ? "left-1.5 top-1.5 size-6" : "left-2 top-2 size-7"}`}>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className={compact ? "size-4" : "size-[18px]"}>
      <path d="m12 2 9 5v10l-9 5-9-5V7Z" /><path d="m3 7 9 5 9-5M12 12v10" />
    </svg>
  </span>;
}
