import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CachedComponentPreview } from "../components/CachedComponentPreview";
import { AttachmentUploader } from "../components/AttachmentUploader";
import { componentDataSchema } from "../lib/schema";

test("cached card includes file count in the same place as the closed interactive section", () => {
  const data = componentDataSchema.parse({ name: "Model", attachments: [{ id: "11111111-1111-4111-8111-111111111111", name: "part.step", size: 10, contentType: "application/octet-stream", createdAt: "2026-11-15T12:00:00.000Z" }] });
  const html = renderToStaticMarkup(createElement(CachedComponentPreview, { data }));
  assert.ok(html.indexOf("Файлы") > html.indexOf("Фотографии"));
  assert.ok(html.indexOf("Файлы") < html.indexOf("Тип"));
  assert.match(html, /Файлы<\/span><span[^>]*>1<\/span>/);
  const form = renderToStaticMarkup(createElement(AttachmentUploader, { value: data.attachments, onChange() {}, onUploadingChange() {} }));
  assert.match(form, /<summary[^>]*min-h-12/);
  assert.match(html, /<div class="flex min-h-12 items-center gap-2">/);
});
