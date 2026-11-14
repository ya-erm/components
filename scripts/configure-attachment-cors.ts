import "dotenv/config";
import { S3Client, GetBucketCorsCommand, PutBucketCorsCommand, type CORSRule } from "@aws-sdk/client-s3";

async function main() {
const origins = process.argv.slice(2).filter((value) => value !== "--apply").map((value) => {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("Ожидается HTTPS origin приложения");
  return url.origin;
});
if (!origins.length) throw new Error("Укажите origin приложения; --apply сохраняет конфигурацию");
const client = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
});
const Bucket = process.env.S3_BUCKET ?? "components";
let current: CORSRule[] = [];
try {
  current = (await client.send(new GetBucketCorsCommand({ Bucket }))).CORSRules ?? [];
} catch (error) {
  if ((error as { name?: string }).name !== "NoSuchCORSConfiguration") throw error;
}
const rule: CORSRule = {
  ID: "components-attachment-upload",
  AllowedOrigins: [...new Set(origins)],
  AllowedMethods: ["PUT", "GET", "HEAD"],
  AllowedHeaders: ["content-type"],
  ExposeHeaders: ["ETag", "Content-Disposition"],
  MaxAgeSeconds: 3600,
};
const CORSRules = [...current.filter((entry) => entry.ID !== rule.ID), rule];
console.log(JSON.stringify({ bucket: Bucket, previous: current, proposed: CORSRules }, null, 2));
if (process.argv.includes("--apply")) {
  await client.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules } }));
  const saved = await client.send(new GetBucketCorsCommand({ Bucket }));
  if (!saved.CORSRules?.some((entry) => entry.ID === rule.ID && origins.every((origin) => entry.AllowedOrigins?.includes(origin)))) throw new Error("Не удалось проверить сохранённый CORS");
  console.log("Attachment CORS saved and verified; existing rules preserved.");
}
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Не удалось настроить CORS"); process.exitCode = 1; });
