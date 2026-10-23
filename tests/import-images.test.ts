import assert from "node:assert/strict";
import { test } from "node:test";
import { copyNewComponentImages, downloadImportImage, removeUnusedImportImages } from "../lib/import-images";
import { parseCatalog } from "../lib/catalog";
import { MAX_FILE_SIZE } from "../lib/schema";

const imageUrl = "https://ae01.alicdn.com/test.png";
const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2u0AAAAASUVORK5CYII=", "base64");
const imageFetch = (response: () => Response): typeof fetch => async () => response();

test("image download validates source, redirects, MIME, stream size and empty bodies", async () => {
  let calls = 0;
  const forbiddenFetch: typeof fetch = async () => { calls++; throw new Error("Must not fetch"); };
  for (const url of ["http://ae01.alicdn.com/a", "https://127.0.0.1/a", "https://alicdn.com.attacker.example/a", "https://user:password@ae01.alicdn.com/a", "https://ae01.alicdn.com:8443/a"])
    await assert.rejects(downloadImportImage(url, forbiddenFetch), /не поддерживается/);
  assert.equal(calls, 0);
  await assert.rejects(downloadImportImage(imageUrl, imageFetch(() => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }))), /не поддерживается/);
  await assert.rejects(downloadImportImage(imageUrl, imageFetch(() => new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }))), /PNG/);
  await assert.rejects(downloadImportImage(imageUrl, imageFetch(() => new Response("", { headers: { "content-type": "image/png" } }))), /пустую/);
  await assert.rejects(downloadImportImage(imageUrl, imageFetch(() => new Response("x", { headers: { "content-type": "image/png", "content-length": String(MAX_FILE_SIZE + 1) } }))), /4.5/);
  await assert.rejects(downloadImportImage(imageUrl, imageFetch(() => new Response(Buffer.alloc(MAX_FILE_SIZE + 1), { headers: { "content-type": "image/png" } }))), /4.5/);
  const image = await downloadImportImage(imageUrl, imageFetch(() => new Response(imageBytes, { headers: { "content-type": "image/png; charset=binary" } })));
  assert.equal(image.contentType, "image/png");
  assert.deepEqual(image.buffer, imageBytes);
});

test("confirmed import copies only new component images, reuses our uploads and deduplicates URLs", async () => {
  const previousPublicUrl = process.env.S3_PUBLIC_URL;
  process.env.S3_PUBLIC_URL = "https://storage.example.test/catalog";
  try {
    const item = (id: string, images: string[]) => ({ id, createdAt: "2026-10-23T12:00:00.000Z", updatedAt: "2026-10-23T12:00:00.000Z", data: { name: id, purchases: [], images } });
    const ownUrl = `${process.env.S3_PUBLIC_URL}/public/images/owner/already.png`;
    const current = parseCatalog([item("existing", ["https://example.test/unchanged.png"])]);
    const next = parseCatalog([...current.items, item("new", [imageUrl, ownUrl]), item("another", [imageUrl])]);
    let saves = 0;
    const uploaded: string[] = [];
    await copyNewComponentImages(current, next, "owner", uploaded, async (buffer, type, owner) => {
      assert.deepEqual(buffer, imageBytes);
      assert.equal(type, "image/png");
      assert.equal(owner, "owner");
      saves++;
      return `${process.env.S3_PUBLIC_URL}/public/images/owner/copied.png`;
    }, imageFetch(() => new Response(imageBytes, { headers: { "content-type": "image/png" } })));
    assert.equal(saves, 1);
    assert.deepEqual(next.items[0].data.images, current.items[0].data.images);
    assert.deepEqual(next.items[1].data.images, [uploaded[0], ownUrl]);
    assert.deepEqual(next.items[2].data.images, [uploaded[0]]);
    assert.deepEqual(current.items[0].data.images, ["https://example.test/unchanged.png"]);
  } finally {
    if (previousPublicUrl === undefined) delete process.env.S3_PUBLIC_URL;
    else process.env.S3_PUBLIC_URL = previousPublicUrl;
  }
});

test("cleanup preserves photos referenced by a write whose response was lost", async () => {
  const persisted = parseCatalog([{ id: "part", createdAt: "", updatedAt: "", data: { name: "Part", images: ["https://storage.test/keep.png"], purchases: [] } }]);
  const removed: string[] = [];
  await removeUnusedImportImages(["https://storage.test/keep.png", "https://storage.test/unused.png"], persisted, async (url) => { removed.push(url); });
  assert.deepEqual(removed, ["https://storage.test/unused.png"]);
});
