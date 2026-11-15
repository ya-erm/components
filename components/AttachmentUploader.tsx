"use client";

import { useRef, useState } from "react";
import { type Attachment, MAX_ATTACHMENTS, MAX_ATTACHMENT_SIZE } from "@/lib/schema";
import { Button } from "./ui/Button";
import { WebcadPreview } from "./WebcadPreview";

export function AttachmentUploader({ value, onChange, onUploadingChange }: {
  value: Attachment[];
  onChange: (files: Attachment[]) => void;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(files: File[]) {
    if (!files.length || uploading) return;
    setError("");
    if (files.length + value.length > MAX_ATTACHMENTS) {
      setError(`Не более ${MAX_ATTACHMENTS} файлов на компонент`);
      return;
    }
    if (files.some((file) => file.size === 0 || file.size > MAX_ATTACHMENT_SIZE)) {
      setError("Выберите непустые файлы размером до 20 МБ каждый");
      return;
    }
    setUploading(true);
    onUploadingChange(true);
    const uploaded: Attachment[] = [];
    try {
      for (const file of files) {
        const response = await fetch("/api/files", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить файл");
        const saved = await fetch(result.upload.url, {
          method: "PUT", headers: result.upload.headers, body: file, credentials: "omit",
        });
        if (!saved.ok) throw new Error("Не удалось загрузить файл в хранилище. Повторите попытку.");
        uploaded.push(result.attachment);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Ошибка сети");
    } finally {
      // Успешные загрузки сохраняются и при ошибке следующего файла.
      if (uploaded.length) onChange([...value, ...uploaded]);
      setUploading(false);
      onUploadingChange(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-[var(--color-muted)]">Файлы · {value.length}</p>
      <p className="text-xs text-[var(--color-muted)]">PDF, STEP, STL, чертежи и любые другие файлы. До 20 МБ каждый, не более {MAX_ATTACHMENTS} файлов.</p>
      <input ref={input} type="file" multiple className="sr-only" aria-label="Прикрепить файлы" disabled={uploading} onChange={(event) => upload(Array.from(event.target.files ?? []))} />
      <ul className="flex flex-col gap-2">
        {value.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] p-3">
            <a href={`/api/files/${file.id}`} className="min-w-0 flex-1 basis-40 break-words text-sm text-[var(--color-accent)]">
              {file.name}<span className="ml-2 text-xs text-[var(--color-muted)]">{Math.max(1, Math.ceil(file.size / 1024))} КБ · Скачать</span>
            </a>
            <WebcadPreview file={file} />
            <Button type="button" variant="ghost" disabled={uploading} aria-label={`Открепить ${file.name}`} onClick={() => onChange(value.filter((entry) => entry.id !== file.id))}>Убрать</Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="secondary" disabled={uploading || value.length >= MAX_ATTACHMENTS} onClick={() => input.current?.click()}>{uploading ? "Загружаем…" : "Прикрепить файлы"}</Button>
      <p role="status" aria-live="polite" className="text-sm text-red-400">{error}</p>
    </div>
  );
}
