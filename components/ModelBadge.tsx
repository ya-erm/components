"use client";

import { useState } from "react";
import type { Attachment } from "@/lib/schema";
import { modelAttachments } from "@/lib/webcad-preview";
import { WebcadModelViewer } from "./WebcadPreview";
import { CubeIcon } from "./ui/Field";

export function ModelBadge({ files = [], compact = false, name = "компонента" }: { files?: Attachment[]; compact?: boolean; name?: string }) {
  const [open, setOpen] = useState(false);
  if (!modelAttachments(files).length) return null;
  return <>
    <button type="button" aria-label={`Посмотреть 3D-модель: ${name}`} title="Есть 3D-модель — посмотреть" onClick={() => setOpen(true)}
    className={`absolute z-10 flex size-7 cursor-pointer items-center justify-center bg-transparent p-0 text-indigo-600 hover:text-indigo-800 focus-visible:outline-2 focus-visible:outline-indigo-500 ${compact ? "left-0.5 top-0.5" : "left-1 top-1"}`}>
    <CubeIcon className={compact ? "size-4" : "size-[18px]"} />
    </button>
    {open ? <WebcadModelViewer files={files} onClose={() => setOpen(false)} /> : null}
  </>;
}
