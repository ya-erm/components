// Checks real configured storage using one temporary private object; always cleans it up.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createAttachmentUpload, attachmentDownloadUrl } from "../lib/s3";
import { MAX_ATTACHMENT_SIZE } from "../lib/schema";

async function main() {
  const origin = process.argv[2];
  if (!origin || new URL(origin).protocol !== "https:") throw new Error("Укажите HTTPS origin приложения");
  const owner = `_attachment-check-${randomUUID()}`;
  const id = randomUUID();
  const client = new S3Client({
    region: process.env.S3_REGION || "us-east-1", endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
  const Bucket = process.env.S3_BUCKET ?? "components";
  try {
    const bytes = Buffer.alloc(MAX_ATTACHMENT_SIZE, 137);
    const permit = await createAttachmentUpload(owner, id, "Проверка 20 МБ.stl", bytes.length);
    const preflight = await fetch(permit.url, { method: "OPTIONS", headers: {
      Origin: origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type",
    } });
    assert.ok(preflight.ok, "CORS preflight failed");
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    const upload = (data: Uint8Array) => {
      return fetch(permit.url, { method: "PUT", headers: { ...permit.headers, Origin: origin }, body: Buffer.from(data) });
    };
    const oversized = await upload(Buffer.alloc(MAX_ATTACHMENT_SIZE + 1));
    assert.equal(oversized.status, 403, "Storage must reject a size different from the signed request");
    const saved = await upload(bytes);
    if (!saved.ok) {
      const code = (await saved.text()).match(/<Code>([^<]+)<\/Code>/)?.[1];
      throw new Error(`Storage PUT failed: ${saved.status} ${code ?? ""}`);
    }
    assert.equal(saved.headers.get("access-control-allow-origin"), origin);
    const url = await attachmentDownloadUrl(owner, id);
    assert.ok(url);
    const downloaded = await fetch(url);
    assert.equal(downloaded.status, 200);
    assert.ok(downloaded.headers.get("content-disposition")?.includes("attachment;"));
    const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
    assert.equal(hash(Buffer.from(await downloaded.arrayBuffer())), hash(bytes));
    const unsigned = new URL(url);
    unsigned.search = "";
    assert.equal((await fetch(unsigned)).status, 403, "File must remain private");
    console.log(`Storage check passed: ${bytes.length} bytes, CORS, exact-size policy, signed download, binary integrity, anonymous access denied.`);
  } finally {
    await client.send(new DeleteObjectCommand({ Bucket, Key: `users/${owner}/files/${id}` }));
    console.log("Temporary storage-check object removed.");
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Storage check failed"); process.exitCode = 1; });
