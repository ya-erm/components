import type { Attachment } from "./schema";

export function resolveWebcadOrigin(value: string | undefined, development: boolean) {
  if (development && value) {
    try {
      const url = new URL(value);
      if (["localhost", "127.0.0.1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol) && url.origin === value) return value;
    } catch { /* Fall back to the trusted production origin. */ }
  }
  return "https://cad.ya-erm.ru";
}

export const WEBCAD_ORIGIN = resolveWebcadOrigin(process.env.NEXT_PUBLIC_WEBCAD_ORIGIN, process.env.NODE_ENV === "development");
export const WEBCAD_MAX_BYTES = 20 * 1024 * 1024;
export type WebcadFormat = "step" | "stl" | "webcad";
export type WebcadStage = "kernel" | "building";
export type PreviewState = {
  phase: "connecting" | "downloading" | "rendering" | "ready" | "error";
  error?: string;
  /** Download share, quantized to whole percents. Never an estimate of CAD work. */
  progress?: number;
  stage?: WebcadStage;
};

export function webcadFormat(name: string): WebcadFormat | null {
  if (/\.webcad\.json$/i.test(name)) return "webcad";
  if (/\.(step|stp)$/i.test(name)) return "step";
  return /\.stl$/i.test(name) ? "stl" : null;
}

export function modelAttachments(files: Attachment[] = []) {
  return files.filter((file) => webcadFormat(file.name));
}

export function webcadEmbedUrl(parentOrigin: string, channel: string) {
  return `${WEBCAD_ORIGIN}/#/embed?${new URLSearchParams({ parentOrigin, channel })}`;
}

/** Read a bounded file, including chunked responses without Content-Length. */
export async function readPreviewBytes(response: Response, size: number, onProgress?: (received: number) => void) {
  if (!response.ok) throw new Error(response.status === 401 ? "Сессия истекла. Войдите на сайт заново." : "Не удалось скачать модель. Попробуйте ещё раз.");
  if (!Number.isSafeInteger(size) || size < 1 || size > WEBCAD_MAX_BYTES)
    throw new Error("Для просмотра нужен непустой файл размером до 20 МБ.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Хранилище вернуло пустой файл.");
  const buffer = new Uint8Array(size);
  let offset = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > size) throw new Error("Размер файла не совпадает с вложением.");
      buffer.set(value, offset);
      offset += value.byteLength;
      onProgress?.(offset);
    }
    if (offset !== size) throw new Error("Файл скачался не полностью. Попробуйте ещё раз.");
    return buffer.buffer;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** One iframe, one file, one attempt. Never forwards credentials or URLs to CAD. */
export function createWebcadBridge(options: {
  frame: () => Window | null;
  channel: string;
  requestId: string;
  file: { name: string; size: number; format: WebcadFormat };
  download: (signal: AbortSignal, onProgress: (received: number) => void) => Promise<ArrayBuffer>;
  onChange: (state: PreviewState) => void;
  readyTimeout?: number;
  renderTimeout?: number;
}) {
  const controller = new AbortController();
  let phase: PreviewState["phase"] = "connecting";
  let stage: WebcadStage | undefined;
  const change = (state: PreviewState) => { phase = state.phase; options.onChange(state); };
  const fail = (message: string) => {
    if (controller.signal.aborted) return;
    clearTimeout(timer);
    change({ phase: "error", error: message });
    controller.abort();
  };
  let timer = setTimeout(() => fail("WebCAD не ответил. Возможно, встроенный просмотр ещё не опубликован или сайт недоступен."), options.readyTimeout ?? 30_000);

  async function handleMessage(event: Pick<MessageEvent, "source" | "origin" | "data">) {
    if (controller.signal.aborted || event.origin !== WEBCAD_ORIGIN || !event.source || event.source !== options.frame()) return;
    const data = event.data;
    if (!data || typeof data !== "object" || data.version !== 1 || data.channel !== options.channel) return;
    if (data.type === "webcad:ready" && phase === "connecting") {
      clearTimeout(timer);
      change({ phase: "downloading", progress: 0 });
      timer = setTimeout(() => fail("Загрузка модели заняла слишком много времени. Повторите попытку."), options.renderTimeout ?? 120_000);
      let percent = 0;
      const onProgress = (received: number) => {
        if (!Number.isFinite(received)) return;
        const next = Math.max(0, Math.min(100, Math.floor(received / options.file.size * 100)));
        if (controller.signal.aborted || phase !== "downloading" || next <= percent) return;
        percent = next;
        change({ phase: "downloading", progress: next / 100 });
      };
      try {
        const buffer = await options.download(controller.signal, onProgress);
        if (controller.signal.aborted) return;
        if (buffer.byteLength !== options.file.size || buffer.byteLength < 1 || buffer.byteLength > WEBCAD_MAX_BYTES)
          throw new Error("Размер файла не совпадает с вложением.");
        const frame = options.frame();
        if (!frame) throw new Error("Окно просмотра закрыто.");
        change({ phase: "rendering" });
        frame.postMessage({ type: "webcad:load", version: 1, channel: options.channel,
          requestId: options.requestId, file: { ...options.file, buffer } }, WEBCAD_ORIGIN, [buffer]);
      } catch (error) {
        fail(error instanceof Error ? error.message : "Не удалось загрузить модель.");
      }
    } else if (data.requestId === options.requestId && phase === "rendering") {
      if (data.type === "webcad:progress" && (data.stage === "kernel" || data.stage === "building")) {
        if (stage === data.stage || stage === "building") return;
        stage = data.stage;
        change({ phase: "rendering", stage });
      } else if (data.type === "webcad:loaded") {
        clearTimeout(timer);
        change({ phase: "ready" });
      } else if (data.type === "webcad:error" && typeof data.error?.message === "string") {
        fail(data.error.message.slice(0, 500) || "WebCAD не смог открыть модель.");
      }
    }
  }
  return { handleMessage, dispose() { clearTimeout(timer); controller.abort(); } };
}
