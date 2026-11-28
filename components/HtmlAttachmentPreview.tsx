"use client";

import { useEffect, useState } from "react";
import { attachmentUrl } from "@/lib/attachment-links";
import type { Attachment } from "@/lib/schema";

const previewPolicy = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none';">`;

export function HtmlAttachmentPreview({ file }: { file: Pick<Attachment, "id" | "name"> }) {
  const url = attachmentUrl(file);
  const [markup, setMarkup] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(url, { signal: controller.signal, credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error("File unavailable");
        const html = await response.text();
        if (!controller.signal.aborted) setMarkup(previewPolicy + html);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [url]);

  if (failed) return <p role="alert" className="m-auto px-4 py-6 text-center text-sm text-[var(--color-muted)]">Не удалось открыть HTML-файл.</p>;
  if (markup === undefined) return <p role="status" className="m-auto px-4 py-6 text-center text-sm text-[var(--color-muted)]">Загружаем страницу…</p>;
  return <iframe title={file.name} sandbox="" referrerPolicy="no-referrer" srcDoc={markup} className="min-h-0 w-full flex-1 border-0 bg-white" />;
}
