"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Attachment } from "@/lib/schema";
import { attachmentUrl } from "@/lib/attachment-links";
import { createWebcadBridge, modelAttachments, readPreviewBytes, webcadEmbedUrl, webcadFormat, type PreviewState } from "@/lib/webcad-preview";
import { Button, buttonClass } from "./ui/Button";
import { AttachmentDownload } from "./AttachmentDownload";

const phaseLabels = {
  connecting: "Подключаем WebCAD…",
  downloading: "Загружаем файл модели…",
  rendering: "WebCAD строит модель…",
  ready: "Модель открыта · только просмотр",
  error: "Не удалось открыть модель",
};

const stageLabels = { kernel: "WebCAD загружает геометрическое ядро…", building: "WebCAD строит модель…" };

/** Live status excludes the percent, so assistive tools only announce phase changes. */
export function previewLabel(state: PreviewState, percent = true) {
  if (state.phase === "downloading" && state.progress !== undefined && percent)
    return `${phaseLabels.downloading} ${Math.round(state.progress * 100)} %`;
  if (state.phase === "rendering" && state.stage) return stageLabels[state.stage];
  return phaseLabels[state.phase];
}

export function PreviewProgress({ state }: { state: PreviewState }) {
  const percent = state.phase === "downloading" && state.progress !== undefined ? Math.round(state.progress * 100) : undefined;
  return <div role="progressbar" aria-label={previewLabel(state, false)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    className="relative h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-[var(--color-border)]">
    {percent !== undefined ? <div className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-200 ease-out motion-reduce:transition-none" style={{ width: `${percent}%` }} />
      : <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-[var(--color-accent)] animate-[webcad-progress_1.2s_ease-in-out_infinite] motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-50" />}
  </div>;
}

function PreviewDialog({ file, models, onSelect, onClose }: { file: Attachment; models: Attachment[]; onSelect: (id: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    element.querySelector<HTMLButtonElement>("[data-preview-close]")?.focus();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <dialog ref={dialog} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
      }}
      className="fixed inset-0 m-auto h-[94dvh] max-h-none w-[min(1200px,96vw)] max-w-none overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-0 text-[var(--color-fg)] shadow-2xl backdrop:bg-black/60 max-sm:h-dvh max-sm:w-screen max-sm:rounded-none">
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="min-w-0 flex-1"><h2 id={titleId} className="truncate text-sm font-semibold" title={file.name}>{file.name}</h2><p className="text-xs text-[var(--color-muted)]">3D-просмотр · WebCAD</p></div>
          <AttachmentDownload file={file} />
          <Button type="button" variant="secondary" className="order-first min-h-11 shrink-0 max-sm:w-8 max-sm:border-transparent max-sm:bg-transparent max-sm:p-0 max-sm:text-[var(--color-muted)] max-sm:hover:text-[var(--color-fg)] sm:order-none" onClick={onClose} data-preview-close>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5 sm:hidden"><path d="m15 18-6-6 6-6" /></svg>
            <span className="sr-only sm:hidden">Назад к компоненту</span>
            <span className="hidden sm:inline">Закрыть</span>
          </Button>
          {models.length > 1 ? <label className="flex w-full min-w-0 items-center gap-3 text-xs text-[var(--color-muted)]">
            <span className="shrink-0">Модель</span><select aria-label="3D-модель" value={file.id} onChange={(event) => onSelect(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)]">
              {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
          </label> : null}
        </header>
        <ModelViewport key={file.id} file={file} />
      </div>
    </dialog>, document.body,
  );
}

function ModelViewport({ file }: { file: Attachment }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState("");
  const [state, setState] = useState<PreviewState>({ phase: "connecting" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const format = webcadFormat(file.name);
    if (!format) return;
    const channel = crypto.randomUUID();
    setState({ phase: "connecting" });
    const bridge = createWebcadBridge({
      frame: () => frame.current?.contentWindow ?? null,
      channel, requestId: crypto.randomUUID(), file: { name: file.name, size: file.size, format },
      download: async (signal, onProgress) => readPreviewBytes(await fetch(`/api/files/${file.id}`, { signal, credentials: "same-origin", cache: "no-store" }), file.size, onProgress),
      onChange: setState,
    });
    const receive = (event: MessageEvent) => { void bridge.handleMessage(event); };
    window.addEventListener("message", receive);
    // Attach the listener before the iframe can announce readiness.
    setSrc(webcadEmbedUrl(window.location.origin, channel));
    return () => { window.removeEventListener("message", receive); bridge.dispose(); };
  }, [file.id, file.name, file.size, attempt]);

  return <>
        {state.phase !== "ready" ? <p role="status" aria-live="polite" className="shrink-0 px-4 py-2 text-xs text-[var(--color-muted)]">{previewLabel(state, false)}</p> : null}
        <div className="relative min-h-0 flex-1">
          {src && state.phase !== "error" ? <iframe key={src} ref={frame} src={src} title={`3D-модель ${file.name}`} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" tabIndex={state.phase === "ready" ? 0 : -1} className={`h-full w-full border-0 ${state.phase === "ready" ? "visible" : "invisible"}`} /> : null}
          {state.phase !== "ready" ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 text-center">
            {state.phase === "error" ? <>
              <p className="max-w-md text-sm" role="alert">{state.error}</p>
              <div className="flex flex-wrap justify-center gap-3"><Button type="button" variant="secondary" onClick={() => setAttempt((value) => value + 1)}>Повторить</Button><a href={attachmentUrl(file)} className={buttonClass("ghost")}>Скачать исходник</a></div>
            </> : <><PreviewProgress state={state} /><p className="text-sm tabular-nums text-[var(--color-muted)]">{previewLabel(state)}</p><p className="max-w-sm text-xs text-[var(--color-muted)]">Первый запуск может занять некоторое время</p></>}
          </div> : null}
        </div>
  </>;
}

export function WebcadModelViewer({ files, initialFileId, onClose }: { files: Attachment[]; initialFileId?: string; onClose: () => void }) {
  const models = modelAttachments(files);
  const [selectedId, setSelectedId] = useState(initialFileId ?? models[0]?.id);
  const selected = models.find((file) => file.id === selectedId) ?? models[0];
  return selected ? <PreviewDialog file={selected} models={models} onSelect={setSelectedId} onClose={onClose} /> : null;
}

export function WebcadPreview({ file, files, className }: { file: Attachment; files: Attachment[]; className: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={className} onClick={() => setOpen(true)} title="Посмотреть" aria-label={`Посмотреть: ${file.name}`}>{file.name}</button>
    {open ? <WebcadModelViewer files={files} initialFileId={file.id} onClose={() => setOpen(false)} /> : null}
  </>;
}
