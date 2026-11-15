"use client";

import { useState } from "react";
import type { Attachment } from "@/lib/schema";
import { modelAttachments } from "@/lib/webcad-preview";
import { WebcadModelViewer } from "./WebcadPreview";

export function ModelBadge({ files = [], compact = false, name = "компонента" }: { files?: Attachment[]; compact?: boolean; name?: string }) {
  const [open, setOpen] = useState(false);
  if (!modelAttachments(files).length) return null;
  return <>
    <button type="button" aria-label={`Посмотреть 3D-модель: ${name}`} title="Есть 3D-модель — посмотреть" onClick={() => setOpen(true)}
    className={`absolute z-10 flex size-7 cursor-pointer items-center justify-center bg-transparent p-0 text-indigo-600 hover:text-indigo-800 focus-visible:outline-2 focus-visible:outline-indigo-500 ${compact ? "left-0.5 top-0.5" : "left-1 top-1"}`}>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className={compact ? "size-4" : "size-[18px]"}>
      <path d="m12 2 9 5v10l-9 5-9-5V7Z" /><path d="m3 7 9 5 9-5M12 12v10" />
    </svg>
    </button>
    {open ? <WebcadModelViewer files={files} onClose={() => setOpen(false)} /> : null}
  </>;
}
