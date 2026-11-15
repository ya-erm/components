export const WEBCAD_ORIGIN = "https://cad.ya-erm.ru";
export const WEBCAD_MAX_BYTES = 20 * 1024 * 1024;
export type WebcadFormat = "step" | "stl" | "webcad";
/** What WebCAD reports while rendering (`webcad:progress`): loading its geometry kernel, building the model. */
export type WebcadStage = "kernel" | "building";
export type PreviewState = {
  phase: "connecting" | "downloading" | "rendering" | "ready" | "error";
  error?: string;
  /** Downloading: the share of the file received, 0…1. */
  progress?: number;
  /** Rendering: the stage WebCAD reported last. */
  stage?: WebcadStage;
};

export function webcadFormat(name: string): WebcadFormat | null {
  if (/\.webcad\.json$/i.test(name)) return "webcad";
  if (/\.(step|stp)$/i.test(name)) return "step";
  return /\.stl$/i.test(name) ? "stl" : null;
}

export function webcadEmbedUrl(parentOrigin: string, channel: string) {
  return `${WEBCAD_ORIGIN}/#/embed?${new URLSearchParams({ parentOrigin, channel })}`;
}

/** Read a bounded file, including chunked responses without Content-Length; `onProgress` hears the bytes received so far. */
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
  /** Downloads the file; `onProgress` takes the bytes received so far (shown as a percentage of `file.size`). */
  download: (signal: AbortSignal, onProgress: (received: number) => void) => Promise<ArrayBuffer>;
  onChange: (state: PreviewState) => void;
  readyTimeout?: number;
  renderTimeout?: number;
}) {
  const controller = new AbortController();
  let phase: PreviewState["phase"] = "connecting";
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
      // whole percents only: a re-render per percent, not per network chunk
      let percent = 0;
      const onProgress = (received: number) => {
        const next = Math.min(100, Math.floor((received / options.file.size) * 100));
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
        change({ phase: "rendering", stage: data.stage });
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
