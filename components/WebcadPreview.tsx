"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Attachment } from "@/lib/schema";
import { createWebcadBridge, readPreviewBytes, webcadEmbedUrl, webcadFormat, type PreviewState } from "@/lib/webcad-preview";
import { Button, buttonClass } from "./ui/Button";

const phaseLabels = {
  connecting: "Подключаем WebCAD…",
  downloading: "Загружаем файл модели…",
  rendering: "WebCAD строит модель…",
  ready: "Модель открыта · только просмотр",
  error: "Не удалось открыть модель",
};

const stageLabels = { kernel: "WebCAD загружает геометрическое ядро…", building: "WebCAD строит модель…" };

/**
 * What the preview is doing now: the download (with its percentage unless `percent` is false — a live region
 * should not announce every percent), WebCAD's stage once the file is sent.
 */
export function previewLabel(state: PreviewState, percent = true) {
  if (state.phase === "downloading" && state.progress !== undefined && percent) return `${phaseLabels.downloading} ${Math.round(state.progress * 100)} %`;
  if (state.phase === "rendering" && state.stage) return stageLabels[state.stage];
  return phaseLabels[state.phase];
}

/** The download's share of the file; a running bar while waiting for WebCAD (no percentage to show). */
function PreviewProgress({ state, label }: { state: PreviewState; label: string }) {
  const percent = state.phase === "downloading" && state.progress !== undefined ? Math.round(state.progress * 100) : undefined;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
      className="relative h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-[var(--color-border)]">
      {percent !== undefined
        ? <div className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-200 ease-out motion-reduce:transition-none" style={{ width: `${percent}%` }} />
        : <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-[var(--color-accent)] animate-[webcad-progress_1.2s_ease-in-out_infinite] motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-50" />}
    </div>
  );
}

function PreviewDialog({ file, onClose }: { file: Attachment; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const titleId = useId();
  const [src, setSrc] = useState("");
  const [state, setState] = useState<PreviewState>({ phase: "connecting" });
  const [attempt, setAttempt] = useState(0);

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

  return createPortal(
    <dialog ref={dialog} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      className="fixed inset-0 m-auto h-[94dvh] max-h-none w-[min(1200px,96vw)] max-w-none overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-0 text-[var(--color-fg)] shadow-2xl backdrop:bg-black/60 max-sm:h-dvh max-sm:w-screen max-sm:rounded-none">
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="min-w-0 flex-1"><h2 id={titleId} className="truncate text-sm font-semibold" title={file.name}>{file.name}</h2><p className="text-xs text-[var(--color-muted)]">3D-просмотр · WebCAD</p></div>
          <a href={`/api/files/${file.id}`} className={buttonClass("ghost", "px-3 text-xs")}>Скачать</a>
          <Button type="button" variant="secondary" onClick={onClose} data-preview-close>Закрыть</Button>
        </header>
        {state.phase !== "ready" ? <p role="status" aria-live="polite" className="shrink-0 px-4 py-2 text-xs text-[var(--color-muted)]">{previewLabel(state, false)}</p> : null}
        <div className="relative min-h-0 flex-1">
          {src && state.phase !== "error" ? <iframe key={src} ref={frame} src={src} title={`3D-модель ${file.name}`} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" tabIndex={state.phase === "ready" ? 0 : -1} className={`h-full w-full border-0 ${state.phase === "ready" ? "visible" : "invisible"}`} /> : null}
          {state.phase !== "ready" ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 text-center">
            {state.phase === "error" ? <>
              <p className="max-w-md text-sm" role="alert">{state.error}</p>
              <div className="flex flex-wrap justify-center gap-3"><Button type="button" variant="secondary" onClick={() => setAttempt((value) => value + 1)}>Повторить</Button><a href={`/api/files/${file.id}`} className={buttonClass("ghost")}>Скачать исходник</a></div>
            </> : <><PreviewProgress state={state} label={previewLabel(state, false)} /><p className="text-sm tabular-nums text-[var(--color-muted)]">{previewLabel(state)}</p><p className="max-w-sm text-xs text-[var(--color-muted)]">Первый запуск может занять некоторое время</p></>}
          </div> : null}
        </div>
      </div>
    </dialog>, document.body,
  );
}

export function WebcadPreview({ file }: { file: Attachment }) {
  const [open, setOpen] = useState(false);
  if (!webcadFormat(file.name)) return null;
  return <>
    <Button type="button" variant="secondary" className="shrink-0 px-3 text-xs" onClick={() => setOpen(true)} aria-label={`Посмотреть: ${file.name}`}>Посмотреть</Button>
    {open ? <PreviewDialog file={file} onClose={() => setOpen(false)} /> : null}
  </>;
}
