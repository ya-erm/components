import assert from "node:assert/strict";
import { test } from "node:test";
import { componentDataSchema, attachmentUploadSchema, MAX_ATTACHMENT_SIZE } from "../lib/schema";
import { parseCatalog } from "../lib/catalog";

const file = { id: "ec495b65-64cd-4080-83d0-c55de3ec6b1b", name: "Чертёж.step", size: 1024, contentType: "application/octet-stream", createdAt: "2026-11-14T12:00:00.000Z" };

test("old catalogs remain readable and attachment metadata survives normalization", () => {
  assert.deepEqual(componentDataSchema.parse({ name: "Old" }).attachments, []);
  const catalog = parseCatalog([{ id: "component", createdAt: "", updatedAt: "", data: { name: "CAD model", purchases: [], attachments: [file] } }]);
  assert.deepEqual(parseCatalog(JSON.parse(JSON.stringify(catalog))).items[0].data.attachments, [file]);
});

test("attachments reject invalid IDs, sizes, duplicate IDs and excess records", () => {
  for (const attachments of [
    [{ ...file, id: "../other-user" }], [{ ...file, size: MAX_ATTACHMENT_SIZE + 1 }],
    [{ ...file, size: 0 }], [{ ...file, name: "" }], [file, file],
    Array.from({ length: 31 }, (_, index) => ({ ...file, id: `ec495b65-64cd-4080-83d0-${String(index).padStart(12, "0")}` })),
  ]) assert.equal(componentDataSchema.safeParse({ name: "Invalid", attachments }).success, false);
});

test("upload and catalog limits accept exactly 20 MiB and reject one extra byte", () => {
  assert.equal(MAX_ATTACHMENT_SIZE, 20 * 1024 * 1024);
  assert.equal(attachmentUploadSchema.safeParse({ name: "model.stl", size: MAX_ATTACHMENT_SIZE }).success, true);
  assert.equal(componentDataSchema.safeParse({ name: "Model", attachments: [{ ...file, size: MAX_ATTACHMENT_SIZE }] }).success, true);
  for (const size of [0, -1, 1.5, MAX_ATTACHMENT_SIZE + 1])
    assert.equal(attachmentUploadSchema.safeParse({ name: "model.stl", size }).success, false);
  assert.equal(attachmentUploadSchema.safeParse({ name: "model.stl", size: 100, key: "users/victim/files/id" }).success, false);
});
