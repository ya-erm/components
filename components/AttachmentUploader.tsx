"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type Attachment, MAX_ATTACHMENTS, MAX_ATTACHMENT_SIZE } from "@/lib/schema";
import type { ComponentDTO } from "@/lib/components-repo";
import { changeAttachment, mergeAttachmentDraft } from "@/lib/attachment-actions";
import { Button } from "./ui/Button";
import { AttachmentSectionHeader, attachmentSectionClass } from "./AttachmentSectionHeader";
import { WebcadPreview } from "./WebcadPreview";

export function AttachmentUploader({ value, savedValue = [], componentId, onPersisted, onChange, onUploadingChange }: {
  value: Attachment[];
  savedValue?: Attachment[];
  componentId?: string;
  onPersisted?: (item: ComponentDTO) => void;
  onChange: (files: Attachment[]) => void;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const [undo, setUndo] = useState<{ file: Attachment; index: number; persisted: boolean }[]>([]);

  async function remove(file: Attachment) {
    if (busy.current) return;
    busy.current = true;
    setUploading(true);
    onUploadingChange(true);
    setError("");
    const index = value.findIndex((entry) => entry.id === file.id);
    try {
      let persisted = false;
      let position = index;
      if (componentId) {
        const result = await changeAttachment(componentId, file, "remove", index);
        persisted = result.changed || savedValue.some((entry) => entry.id === file.id);
        position = result.index;
        onChange(mergeAttachmentDraft(value, savedValue, result.item.data.attachments ?? [], file.id));
        onPersisted?.(result.item);
      } else onChange(value.filter((entry) => entry.id !== file.id));
      setUndo((entries) => [...entries, { file, index: position, persisted }]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось удалить файл.");
    } finally {
      busy.current = false;
      setUploading(false);
      onUploadingChange(false);
    }
  }

  async function restore() {
    const entry = undo.at(-1);
    if (!entry || busy.current) return;
    busy.current = true;
    setUploading(true);
    onUploadingChange(true);
    setError("");
    try {
      if (componentId && entry.persisted) {
        const result = await changeAttachment(componentId, entry.file, "restore", entry.index);
        onChange(mergeAttachmentDraft(value, savedValue, result.item.data.attachments ?? []));
        onPersisted?.(result.item);
      } else if (!value.some((file) => file.id === entry.file.id)) {
        const next = [...value];
        next.splice(Math.min(entry.index, next.length), 0, entry.file);
        onChange(next);
      }
      setUndo((entries) => entries.slice(0, -1));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось восстановить файл.");
    } finally {
      busy.current = false;
      setUploading(false);
      onUploadingChange(false);
    }
  }

  async function upload(files: File[]) {
    if (!files.length || busy.current) return;
    setError("");
    if (files.length + value.length > MAX_ATTACHMENTS) {
      setError(`Не более ${MAX_ATTACHMENTS} файлов на компонент`);
      return;
    }
    if (files.some((file) => file.size === 0 || file.size > MAX_ATTACHMENT_SIZE)) {
      setError("Выберите непустые файлы размером до 20 МБ каждый");
      return;
    }
    busy.current = true;
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
      busy.current = false;
      onUploadingChange(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
    <details className="group">
      <summary className={`${attachmentSectionClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <AttachmentSectionHeader count={value.length} />
      </summary>
      <div className="mt-3 flex flex-col gap-3">
      <input ref={input} type="file" multiple className="sr-only" aria-label="Прикрепить файлы" disabled={uploading} onChange={(event) => upload(Array.from(event.target.files ?? []))} />
      <ul className="flex flex-col gap-2">
        {value.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] p-3">
            <a href={`/api/files/${file.id}`} className="min-w-0 flex-1 basis-40 break-words text-sm text-[var(--color-accent)]">
              {file.name}<span className="ml-2 text-xs text-[var(--color-muted)]">{Math.max(1, Math.ceil(file.size / 1024))} КБ · Скачать</span>
            </a>
            <WebcadPreview file={file} />
            <Button type="button" variant="ghost" className="size-10 shrink-0 !p-0 !text-red-500 hover:bg-red-500/10 hover:!text-red-600" disabled={uploading} aria-label={`Удалить файл ${file.name}`} title="Удалить файл" onClick={() => void remove(file)}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="secondary" disabled={uploading || value.length >= MAX_ATTACHMENTS} onClick={() => input.current?.click()}>{uploading ? "Сохраняем…" : "Прикрепить файлы"}</Button>
      </div>
    </details>
    {error ? <p role="alert" className="text-sm text-red-500">{error}</p> : null}
    {undo.length ? createPortal(<div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex justify-end pb-[env(safe-area-inset-bottom)]">
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg">
        <p role="status" aria-live="polite" className="min-w-0 text-sm">{undo.length > 1 ? `Удалено файлов: ${undo.length}` : "Файл удалён"}<span className="mt-0.5 block max-w-44 truncate text-xs text-[var(--color-muted)]" title={undo.at(-1)?.file.name}>{undo.at(-1)?.file.name}</span></p>
        <Button type="button" variant="ghost" className="px-2 !text-[var(--color-accent)]" disabled={uploading} onClick={() => void restore()}>Отменить</Button>
        <button type="button" aria-label="Закрыть уведомление" className="size-8 shrink-0 rounded-lg text-xl text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]" onClick={() => setUndo([])}>×</button>
      </div>
    </div>, document.body) : null}
    </>
  );
}
