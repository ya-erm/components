import assert from "node:assert/strict";
import { test } from "node:test";
import { S3Client, type PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

test("photo uploads store WebP with quality 95 for every supported format", async (t) => {
  const previousEnv = { ...process.env };
  Object.assign(process.env, {
    S3_PUBLIC_URL: "https://storage.example.test",
    S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "test",
  });
  t.after(() => { process.env = previousEnv; });
  const { uploadImage } = await import("../lib/s3");
  const writes: PutObjectCommand["input"][] = [];
  t.mock.method(S3Client.prototype, "send", async (command: PutObjectCommand) => {
    writes.push(command.input);
    return {};
  });

  for (const format of ["jpeg", "png", "webp", "gif", "avif"] as const) {
    const source = await sharp({
      create: { width: 32, height: 24, channels: 4, background: "#527da780" },
    }).toFormat(format).toBuffer();
    const url = await uploadImage(source, `image/${format}`, "owner");
    const saved = writes.at(-1)!;
    assert.match(url, /^https:\/\/storage\.example\.test\/public\/images\/owner\/[\w-]+\.webp$/);
    assert.ok(url.endsWith(saved.Key!));
    assert.equal(saved.ContentType, "image/webp");
    const body = saved.Body as Buffer;
    const metadata = await sharp(body).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 32);
    assert.equal(metadata.height, 24);
    assert.deepEqual(body, await sharp(source, { animated: true }).rotate().webp({ quality: 95 }).toBuffer());
    if (format === "png") {
      const { data } = await sharp(body).raw().toBuffer({ resolveWithObject: true });
      assert.equal(data[3], 128, "transparent pixels retain their alpha channel");
    }
  }

  const rotated = await sharp({
    create: { width: 32, height: 24, channels: 3, background: "red" },
  }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  await uploadImage(rotated, "image/jpeg", "owner");
  const oriented = await sharp(writes.at(-1)!.Body as Buffer).metadata();
  assert.equal(oriented.width, 24);
  assert.equal(oriented.height, 32);
  assert.equal(oriented.orientation, undefined);

  const frames = Buffer.concat([Buffer.alloc(8 * 8 * 3, 0), Buffer.alloc(8 * 8 * 3, 255)]);
  const animated = await sharp(frames, {
    raw: { width: 8, height: 16, pageHeight: 8, channels: 3 },
  }).gif({ delay: [100, 200], loop: 0 }).toBuffer();
  await uploadImage(animated, "image/gif", "owner");
  const animation = await sharp(writes.at(-1)!.Body as Buffer, { animated: true }).metadata();
  assert.equal(animation.pages, 2);
  assert.deepEqual(animation.delay, [100, 200]);
  assert.equal(animation.loop, 0);

  const count = writes.length;
  await assert.rejects(uploadImage(Buffer.from("broken image"), "image/png", "owner"));
  await assert.rejects(uploadImage(Buffer.from("<svg/>"), "image/svg+xml", "owner"), /Недопустимый/);
  assert.equal(writes.length, count, "invalid files must never reach storage");
});
