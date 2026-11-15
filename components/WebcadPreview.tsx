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
      download: async (signal) => readPreviewBytes(await fetch(`/api/files/${file.id}`, { signal, credentials: "same-origin", cache: "no-store" }), file.size),
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
        <p role="status" aria-live="polite" className="shrink-0 px-4 py-2 text-xs text-[var(--color-muted)]">{phaseLabels[state.phase]}</p>
        <div className="relative min-h-0 flex-1">
          {src && state.phase !== "error" ? <iframe key={src} ref={frame} src={src} title={`3D-модель ${file.name}`} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" tabIndex={state.phase === "ready" ? 0 : -1} className={`h-full w-full border-0 ${state.phase === "ready" ? "visible" : "invisible"}`} /> : null}
          {state.phase !== "ready" ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 text-center">
            {state.phase === "error" ? <>
              <p className="max-w-md text-sm" role="alert">{state.error}</p>
              <div className="flex flex-wrap justify-center gap-3"><Button type="button" variant="secondary" onClick={() => setAttempt((value) => value + 1)}>Повторить</Button><a href={`/api/files/${file.id}`} className={buttonClass("ghost")}>Скачать исходник</a></div>
            </> : <><span aria-hidden="true" className="size-7 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)] motion-reduce:animate-none" /><p className="text-sm text-[var(--color-muted)]">{phaseLabels[state.phase]}</p><p className="max-w-sm text-xs text-[var(--color-muted)]">Первый запуск может занять немного времени: CAD загружает геометрическое ядро.</p></>}
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
    <Button type="button" variant="secondary" className="shrink-0 px-3 text-xs" onClick={() => setOpen(true)} aria-label={`Посмотреть 3D: ${file.name}`}>Посмотреть 3D</Button>
    {open ? <PreviewDialog file={file} onClose={() => setOpen(false)} /> : null}
  </>;
}
