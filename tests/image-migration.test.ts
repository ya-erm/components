import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { migrateS3Images, replaceImageUrls } from "../lib/image-migration";

const etag = (body: Buffer) => `"${createHash("sha256").update(body).digest("hex")}"`;
const publicUrl = "https://storage.example.test/bucket";

test("URL replacement preserves legacy structure, unknown fields and unrelated text", () => {
  const source = [{ data: { images: ["old", "external"], custom: { url: "old" }, note: "text old" } }];
  assert.deepEqual(replaceImageUrls(source, new Map([["old", "new"]])), {
    value: [{ data: { images: ["new", "external"], custom: { url: "new" }, note: "text old" } }], count: 2,
  });
  assert.equal(source[0].data.images[0], "old");
});

test("migration copies photos, preserves originals, backs up catalogs and safely resumes", async (t) => {
  type ObjectValue = { body: Buffer; metadata?: Record<string, string> };
  const sourceKey = "public/images/owner/photo.png";
  const orphanKey = "public/images/owner/unused.png";
  const image = await sharp({ create: { width: 64, height: 48, channels: 4, background: "#12345680" } }).png().toBuffer();
  const original = Buffer.from(JSON.stringify({
    version: 2, custom: { preserve: true },
    items: [{ id: "part", updatedAt: "original-date", data: { images: [`${publicUrl}/${sourceKey}`], note: "unchanged" } }],
    projects: [{ id: "project", images: [`${publicUrl}/${sourceKey}`, "https://external.test/image.jpg"] }],
  }, null, 2));
  const objects = new Map<string, ObjectValue>([
    [sourceKey, { body: image }], [orphanKey, { body: image }],
    ["public/images/owner/new.webp", { body: await sharp(image).webp({ quality: 95 }).toBuffer(), metadata: { "webp-quality": "95" } }],
    ["public/images/owner/readme.txt", { body: Buffer.from("not a photo") }],
    ["users/owner/catalog.json", { body: original }],
    ["users/other/catalog.json", { body: Buffer.from('[{"data":{"images":["https://external.test/a.png"]}}]') }],
    ["users/owner/files/model", { body: Buffer.from("3d model") }],
  ]);
  const client = new S3Client({ region: "us-east-1", credentials: { accessKeyId: "test", secretAccessKey: "test" } });
  t.after(() => client.destroy());
  let puts = 0;
  let conflict = false;
  const failure = (status: number) => Object.assign(new Error("Storage error"), { $metadata: { httpStatusCode: status } });
  t.mock.method(client, "send", async (command: unknown) => {
    if (command instanceof ListObjectsV2Command) {
      const all = [...objects].filter(([key]) => key.startsWith(command.input.Prefix!));
      const offset = Number(command.input.ContinuationToken ?? 0);
      const page = all.slice(offset, offset + 2);
      return {
        Contents: page.map(([Key, value]) => ({ Key, ETag: etag(value.body) })),
        IsTruncated: offset + 2 < all.length, NextContinuationToken: String(offset + 2),
      };
    }
    if (command instanceof GetObjectCommand) {
      const value = objects.get(command.input.Key!);
      if (!value) throw failure(404);
      if (command.input.IfMatch && command.input.IfMatch !== etag(value.body)) throw failure(412);
      return { ETag: etag(value.body), Metadata: value.metadata, Body: { transformToByteArray: async () => value.body } };
    }
    if (command instanceof PutObjectCommand) {
      const input = command.input;
      const key = input.Key!;
      const current = objects.get(key);
      if (input.IfNoneMatch === "*" && current) throw failure(412);
      if (input.IfMatch && (conflict || !current || input.IfMatch !== etag(current.body))) throw failure(412);
      puts++;
      objects.set(key, { body: Buffer.from(input.Body as Buffer | string), metadata: input.Metadata });
      return {};
    }
    throw new Error("Unexpected command: deletion is forbidden");
  });

  const dry = await migrateS3Images(client, { bucket: "bucket", publicUrl });
  assert.equal(puts, 0, "dry-run must never write");
  assert.equal(dry.images.length, 2, "unreferenced photos are also converted");
  assert.equal(dry.catalogs.length, 1);
  assert.equal(dry.catalogs[0].replacements, 2);
  const applied = await migrateS3Images(client, { bucket: "bucket", publicUrl, apply: true });
  assert.equal(applied.status, "complete");
  assert.equal(applied.catalogs[0].status, "applied");
  assert.equal(applied.catalogs[0].sourceETag, etag(original));
  assert.equal(applied.catalogs[0].appliedETag, etag(objects.get("users/owner/catalog.json")!.body));
  assert.deepEqual(objects.get(sourceKey)!.body, image);
  assert.deepEqual(objects.get(orphanKey)!.body, image);
  assert.deepEqual(objects.get(applied.catalogs[0].backupKey)!.body, original);
  for (const entry of applied.images) {
    assert.equal((await sharp(objects.get(entry.targetKey)!.body).metadata()).format, "webp");
    assert.equal(objects.get(entry.targetKey)!.metadata?.["webp-quality"], "95");
  }
  const target = applied.images.find((entry) => entry.sourceKey === sourceKey)!.targetKey;
  const updated = JSON.parse(objects.get("users/owner/catalog.json")!.body.toString());
  assert.equal(updated.items[0].data.images[0], `${publicUrl}/${target}`);
  assert.equal(updated.projects[0].images[0], `${publicUrl}/${target}`);
  assert.equal(updated.projects[0].images[1], "https://external.test/image.jpg");
  assert.equal(updated.items[0].updatedAt, "original-date");
  assert.deepEqual(updated.custom, { preserve: true });
  assert.equal(JSON.parse(objects.get(applied.manifestKey)!.body.toString()).status, "complete");

  const repeated = await migrateS3Images(client, { bucket: "bucket", publicUrl, apply: true });
  assert.equal(repeated.catalogs.length, 0);
  assert.deepEqual(repeated.images.map((entry) => entry.targetKey), applied.images.map((entry) => entry.targetKey));

  // Конкурентная запись не затирается. Копии и резервная копия сохраняются.
  objects.set("users/owner/catalog.json", { body: original });
  conflict = true;
  await assert.rejects(migrateS3Images(client, { bucket: "bucket", publicUrl, apply: true }));
  assert.deepEqual(objects.get("users/owner/catalog.json")!.body, original);
  assert.ok([...objects].some(([key, value]) => key.endsWith("/manifest.json") && JSON.parse(value.body.toString()).status === "failed"));
  conflict = false;

  const converted = objects.get(target)!;
  objects.set(target, { body: Buffer.from("unexpected content") });
  await assert.rejects(migrateS3Images(client, { bucket: "bucket", publicUrl, apply: true }), /перезапись запрещена/);
  assert.equal(objects.get(target)!.body.toString(), "unexpected content");
  assert.deepEqual(objects.get("users/owner/catalog.json")!.body, original);
  objects.set(target, converted);

  // Повреждённое изображение останавливает миграцию до изменения каталогов.
  objects.set("public/images/owner/broken.png", { body: Buffer.from("broken") });
  await assert.rejects(migrateS3Images(client, { bucket: "bucket", publicUrl, apply: true }));
  assert.deepEqual(objects.get("users/owner/catalog.json")!.body, original);
});
