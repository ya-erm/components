import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { changeAttachment, mergeAttachmentDraft, mergeReorderedAttachments, reorderAttachments } from "../lib/attachment-actions";
import { ModelBadge } from "../components/ModelBadge";
import { ComponentCard } from "../components/ComponentCard";
import { componentDataSchema } from "../lib/schema";
import { modelAttachments } from "../lib/webcad-preview";
import type { Attachment } from "../lib/schema";

const file = (id: string, name = `${id}.step`): Attachment => ({ id, name, size: 10, contentType: "application/octet-stream", createdAt: "2026-11-15T12:00:00.000Z" });
const a = file("a"), b = file("b"), c = file("c"), draft = file("draft");

test("immediate remove and undo only PATCH attachments, retry conflicts against fresh server data", async () => {
  let files = [a, b];
  let version = 1;
  let patches = 0;
  const item = () => ({ id: "component", data: { name: "Saved name", note: "Saved note", attachments: files } });
  const request = (async (_url: unknown, init?: RequestInit) => {
    if (!init?.method) return Response.json(item(), { headers: { ETag: `W/"${version}"` } });
    assert.equal(init.method, "PATCH");
    const body = JSON.parse(init.body as string);
    assert.deepEqual(Object.keys(body), ["data"]);
    assert.deepEqual(Object.keys(body.data), ["attachments"]);
    assert.equal((init.headers as Record<string, string>)["If-Match"], `W/"${version}"`);
    if (++patches === 1) { files = [a, b, c]; version++; return Response.json({}, { status: 409 }); }
    files = body.data.attachments;
    version++;
    return Response.json(item());
  }) as typeof fetch;
  const removed = await changeAttachment("component", a, "remove", 0, request);
  assert.deepEqual(files, [b, c]);
  assert.equal(removed.item.data.note, "Saved note");
  assert.equal(removed.index, 0);
  const restored = await changeAttachment("component", a, "restore", removed.index, request);
  assert.deepEqual(files, [a, b, c]);
  assert.equal(restored.changed, true);
  const repeated = await changeAttachment("component", a, "restore", 0, request);
  assert.equal(repeated.changed, false);
  assert.equal(patches, 3);
});

test("local unsaved uploads are retained when rebasing immediate file actions", () => {
  assert.deepEqual(mergeAttachmentDraft([a, b, draft], [a, b], [b, c], a.id), [b, c, draft]);
  assert.deepEqual(mergeAttachmentDraft([a, b, draft], [a, b], [a, b], draft.id), [a, b]);
  assert.deepEqual(mergeAttachmentDraft([b, draft], [b], [a, b, c]), [a, b, c, draft]);
});

test("failed deletion stays failed; missing local-only file does not PATCH the catalog", async () => {
  const current = () => Response.json({ data: { attachments: [a] } }, { headers: { ETag: '"1"' } });
  const request = (async (_url: unknown, init?: RequestInit) => init?.method
    ? Response.json({ error: "Cannot save" }, { status: 500 }) : current()) as typeof fetch;
  await assert.rejects(changeAttachment("component", a, "remove", 0, request), /Cannot save/);
  const local = await changeAttachment("component", draft, "remove", 0, request);
  assert.equal(local.changed, false);
  const conflict = (async (_url: unknown, init?: RequestInit) => init?.method ? Response.json({}, { status: 409 }) : current()) as typeof fetch;
  await assert.rejects(changeAttachment("component", a, "remove", 0, conflict), /другом окне/);
});

test("model cube badge uses supported attachments, never arbitrary JSON or photos", () => {
  for (const name of ["a.STEP", "a.stp", "a.stl", "a.webcad.json"])
    assert.ok(renderToStaticMarkup(createElement(ModelBadge, { files: [file("a", name)] })).includes("Есть 3D-модель"));
  for (const name of ["a.json", "a.pdf", "a.png", "a.step.zip"])
    assert.equal(renderToStaticMarkup(createElement(ModelBadge, { files: [file("a", name)] })), "");
});

test("reordering rebases on conflicts, retaining new server files and dropping removed references", async () => {
  let files = [a, b];
  let version = 1;
  let patches = 0;
  const request = (async (_url: unknown, init?: RequestInit) => {
    const item = () => ({ data: { name: "Saved", note: "Saved note", attachments: files } });
    if (!init?.method) return Response.json(item(), { headers: { ETag: `W/"${version}"` } });
    assert.equal(init.method, "PATCH");
    assert.equal((init.headers as Record<string, string>)["If-Match"], `W/"${version}"`);
    const body = JSON.parse(init.body as string);
    assert.deepEqual(Object.keys(body.data), ["attachments"]);
    if (++patches === 1) { files = [c, b]; version++; return Response.json({}, { status: 409 }); }
    files = body.data.attachments;
    return Response.json(item());
  }) as typeof fetch;
  const saved = await reorderAttachments("component", [b.id, a.id], request);
  assert.deepEqual(saved.data.attachments, [b, c]);
  assert.equal(saved.data.note, "Saved note");
  assert.deepEqual(modelAttachments(saved.data.attachments)[0], b);
  const merged = mergeReorderedAttachments([draft, b, a], [a, b], [b, c]);
  assert.deepEqual(merged, [draft, b, c]);
  assert.equal(patches, 2);
});

test("quick preview is a separate button outside card navigation or selection", () => {
  const item = { id: "component", data: componentDataSchema.parse({ name: "Model", attachments: [{ ...a, id: "11111111-1111-4111-8111-111111111111" }] }), createdAt: a.createdAt, updatedAt: a.createdAt };
  const link = renderToStaticMarkup(createElement(ComponentCard, { item }));
  assert.ok(link.includes('aria-label="Посмотреть 3D-модель: Model"'));
  assert.ok(!/<a\b[^>]*>[\s\S]*?<button\b[\s\S]*?<\/a>/.test(link), "No button may be nested in the card link");
  const selection = renderToStaticMarkup(createElement(ComponentCard, { item, onSelect() {}, selected: true }));
  for (const button of selection.match(/<button\b[\s\S]*?<\/button>/g) ?? [])
    assert.equal((button.match(/<button\b/g) ?? []).length, 1, "No nested selection / preview buttons");
});
