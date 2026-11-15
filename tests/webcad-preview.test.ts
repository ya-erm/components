import assert from "node:assert/strict";
import test from "node:test";
import { createWebcadBridge, readPreviewBytes, webcadEmbedUrl, webcadFormat, WEBCAD_ORIGIN, type PreviewState } from "../lib/webcad-preview";
import { previewLabel } from "../components/WebcadPreview";

function harness(download = async (_signal: AbortSignal, _onProgress: (received: number) => void) => new Uint8Array([1, 2, 3]).buffer) {
  const states: PreviewState[] = [];
  const sent: unknown[][] = [];
  const frame = { postMessage: (...args: unknown[]) => sent.push(args) } as unknown as Window;
  const bridge = createWebcadBridge({ frame: () => frame, channel: "channel", requestId: "request",
    file: { name: "model.step", size: 3, format: "step" }, download, onChange: (state) => states.push(state), readyTimeout: 20, renderTimeout: 30 });
  const message = (type: string, extra = {}) => ({ origin: WEBCAD_ORIGIN, source: frame,
    data: { type, version: 1, channel: "channel", requestId: "request", ...extra } });
  return { ...bridge, frame, sent, states, message };
}

test("only supported model filenames enable preview; URL contains no file URL or credentials", () => {
  for (const name of ["a.STEP", "a.stp"]) assert.equal(webcadFormat(name), "step");
  assert.equal(webcadFormat("a.STL"), "stl");
  assert.equal(webcadFormat("a.WEBCAD.JSON"), "webcad");
  for (const name of ["a.json", "a.pdf", "a.step.zip", "a.png", "a.webcad.json.bak"]) assert.equal(webcadFormat(name), null);
  const url = new URL(webcadEmbedUrl("https://ya-components.vercel.app", "channel"));
  assert.equal(url.origin, WEBCAD_ORIGIN);
  assert.equal(url.search, "");
  assert.equal(new URLSearchParams(url.hash.split("?")[1]).get("parentOrigin"), "https://ya-components.vercel.app");
});

test("bridge rejects untrusted messages, transfers bytes once, and correlates render completion", async () => {
  let downloads = 0;
  const h = harness(async () => { downloads++; return new Uint8Array([1, 2, 3]).buffer; });
  try {
    const ready = h.message("webcad:ready");
    for (const event of [
      { ...ready, origin: "https://evil.example" }, { ...ready, source: null },
      { ...ready, source: {} as Window }, h.message("webcad:ready", { channel: "wrong" }),
      h.message("webcad:ready", { version: 2 }),
    ]) await h.handleMessage(event);
    assert.equal(downloads, 0);
    await h.handleMessage(ready);
    await h.handleMessage(ready);
    assert.equal(downloads, 1);
    assert.equal(h.sent.length, 1);
    const [payload, origin, transfer] = h.sent[0] as [{ file: { buffer: ArrayBuffer }; type: string }, string, ArrayBuffer[]];
    assert.equal(origin, WEBCAD_ORIGIN);
    assert.equal(payload.type, "webcad:load");
    assert.deepEqual([...new Uint8Array(payload.file.buffer)], [1, 2, 3]);
    assert.equal(transfer[0], payload.file.buffer);
    assert.ok(!JSON.stringify(payload).includes("Authorization"));
    await h.handleMessage(h.message("webcad:loaded", { requestId: "stale" }));
    assert.equal(h.states.at(-1)?.phase, "rendering");
    await h.handleMessage(h.message("webcad:loaded"));
    assert.equal(h.states.at(-1)?.phase, "ready");
  } finally { h.dispose(); }
});

test("closing aborts pending download and suppresses late messages", async () => {
  let resolve!: (bytes: ArrayBuffer) => void;
  let signal!: AbortSignal;
  const h = harness((value) => { signal = value; return new Promise((done) => { resolve = done; }); });
  const pending = h.handleMessage(h.message("webcad:ready"));
  h.dispose();
  assert.equal(signal.aborted, true);
  resolve(new ArrayBuffer(3));
  await pending;
  assert.equal(h.sent.length, 0);
});

test("timeouts, download errors and CAD errors terminate the attempt", async () => {
  const h = harness();
  await new Promise((done) => setTimeout(done, 35));
  assert.equal(h.states.at(-1)?.phase, "error");
  h.dispose();
  const broken = harness(async () => { throw new Error("Download failed"); });
  await broken.handleMessage(broken.message("webcad:ready"));
  assert.equal(broken.states.at(-1)?.error, "Download failed");
  broken.dispose();
  const cad = harness();
  await cad.handleMessage(cad.message("webcad:ready"));
  await cad.handleMessage(cad.message("webcad:error", { error: { code: "INVALID_FILE", message: "Broken STEP" } }));
  assert.equal(cad.states.at(-1)?.error, "Broken STEP");
  cad.dispose();
  const slow = harness();
  await slow.handleMessage(slow.message("webcad:ready"));
  await new Promise((done) => setTimeout(done, 45));
  assert.equal(slow.states.at(-1)?.phase, "error");
  slow.dispose();
});

test("download progress: bytes received per chunk, shown as whole percents of the declared size", async () => {
  const chunks = [new Uint8Array(30), new Uint8Array(30), new Uint8Array(40)];
  const stream = new ReadableStream<Uint8Array>({ start(c) { for (const x of chunks) c.enqueue(x); c.close(); } });
  const received: number[] = [];
  await readPreviewBytes(new Response(stream), 100, (n) => received.push(n));
  assert.deepEqual(received, [30, 60, 100]);

  const h = harness(async (_signal, onProgress) => {
    for (const n of [0, 1, 2, 2, 3]) onProgress(n);
    return new Uint8Array([1, 2, 3]).buffer;
  });
  try {
    await h.handleMessage(h.message("webcad:ready"));
    // 0 → 0 %, 1 → 33 %, 2 → 66 % (once), 3 → 100 %, then the file is sent
    assert.deepEqual(h.states.map((s) => [s.phase, s.progress]), [
      ["downloading", 0], ["downloading", 0.33], ["downloading", 0.66], ["downloading", 1], ["rendering", undefined],
    ]);
  } finally { h.dispose(); }
});

test("WebCAD stages are shown while rendering this request only; unknown stages are ignored", async () => {
  const h = harness();
  try {
    // before the file is sent: not yet
    await h.handleMessage(h.message("webcad:progress", { stage: "kernel" }));
    assert.equal(h.states.length, 0);
    await h.handleMessage(h.message("webcad:ready"));
    await h.handleMessage(h.message("webcad:progress", { stage: "kernel", requestId: "stale" }));
    await h.handleMessage(h.message("webcad:progress", { stage: "export" }));
    await h.handleMessage({ ...h.message("webcad:progress", { stage: "building" }), origin: "https://evil.example" });
    assert.deepEqual(h.states.at(-1), { phase: "rendering" });
    await h.handleMessage(h.message("webcad:progress", { stage: "kernel" }));
    assert.deepEqual(h.states.at(-1), { phase: "rendering", stage: "kernel" });
    await h.handleMessage(h.message("webcad:progress", { stage: "building" }));
    assert.deepEqual(h.states.at(-1), { phase: "rendering", stage: "building" });
    await h.handleMessage(h.message("webcad:loaded"));
    await h.handleMessage(h.message("webcad:progress", { stage: "kernel" }));
    assert.equal(h.states.at(-1)?.phase, "ready");
  } finally { h.dispose(); }
});

test("labels: the download's percentage (not for the live status), WebCAD's stage", () => {
  assert.equal(previewLabel({ phase: "downloading", progress: 0.42 }), "Загружаем файл модели… 42 %");
  assert.equal(previewLabel({ phase: "downloading", progress: 0.42 }, false), "Загружаем файл модели…");
  assert.equal(previewLabel({ phase: "rendering", stage: "kernel" }), "WebCAD загружает геометрическое ядро…");
  assert.equal(previewLabel({ phase: "rendering", stage: "building" }), "WebCAD строит модель…");
  assert.equal(previewLabel({ phase: "rendering" }), "WebCAD строит модель…");
  assert.equal(previewLabel({ phase: "connecting" }), "Подключаем WebCAD…");
});

test("file reads enforce declared size for success, oversized, empty and truncated responses", async () => {
  assert.deepEqual([...new Uint8Array(await readPreviewBytes(new Response(new Uint8Array([1, 2, 3])), 3))], [1, 2, 3]);
  await assert.rejects(readPreviewBytes(new Response(new Uint8Array([1, 2, 3])), 2), /Размер/);
  await assert.rejects(readPreviewBytes(new Response(new Uint8Array([1])), 2), /не полностью/);
  await assert.rejects(readPreviewBytes(new Response(null, { status: 401 }), 1), /Сессия/);
  await assert.rejects(readPreviewBytes(new Response(null), 1), /пустой/);
  await assert.rejects(readPreviewBytes(new Response(null), 20971521), /20 МБ/);
});
