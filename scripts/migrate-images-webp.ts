/** Без --apply только читает S3 и считает результат конвертации. */
import "dotenv/config";
import { S3Client } from "@aws-sdk/client-s3";
import { migrateS3Images } from "../lib/image-migration";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) throw new Error("Поддерживается только флаг --apply");
  for (const name of ["S3_BUCKET", "S3_PUBLIC_URL", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"])
    if (!process.env[name]) throw new Error(`Не задана переменная ${name}`);
  const client = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
  const report = await migrateS3Images(client, {
    bucket: process.env.S3_BUCKET!, publicUrl: process.env.S3_PUBLIC_URL!,
    apply: args.includes("--apply"), onProgress: console.log,
  });
  const originalBytes = report.images.reduce((sum, entry) => sum + entry.originalBytes, 0);
  const webpBytes = report.images.reduce((sum, entry) => sum + entry.webpBytes, 0);
  console.log(JSON.stringify({
    mode: report.mode, status: report.status, photos: report.images.length, skipped: report.skipped.length,
    catalogs: report.catalogs.length, references: report.catalogs.reduce((sum, entry) => sum + entry.replacements, 0),
    originalBytes, webpBytes, potentialSavedBytes: originalBytes - webpBytes,
    originalsRetained: true,
    ...(report.mode === "apply" ? { manifestKey: report.manifestKey } : {}),
  }, null, 2));
}

main().catch((error) => {
  console.error("Миграция остановлена:", error.name,
    error.$metadata ? `HTTP ${error.$metadata.httpStatusCode ?? "?"}` : error.message);
  process.exitCode = 1;
});
