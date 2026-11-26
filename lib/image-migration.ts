import { createHash, randomUUID } from "node:crypto";
import {
  S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand,
} from "@aws-sdk/client-s3";
import { convertImageToWebp } from "./image-webp";

const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const imagePrefix = "public/images/";
const migrationFolder = "/_webp-q95/";

export type ImageMigrationEntry = {
  sourceKey: string;
  sourceETag: string;
  targetKey: string;
  originalBytes: number;
  webpBytes: number;
  sha256: string;
};

export type ImageMigrationReport = {
  version: 1;
  quality: 95;
  mode: "apply" | "dry-run";
  status: "running" | "complete" | "failed";
  run: string;
  bucket: string;
  publicUrl: string;
  manifestKey: string;
  images: ImageMigrationEntry[];
  skipped: { key: string; reason: string }[];
  catalogs: { key: string; backupKey: string; sourceETag: string; appliedETag?: string; replacements: number; status: "planned" | "applied" }[];
};

/** Меняет только точные URL; остальные поля и неизвестные расширения схемы сохраняет. */
export function replaceImageUrls(value: unknown, replacements: Map<string, string>): { value: unknown; count: number } {
  if (typeof value === "string") {
    const replacement = replacements.get(value);
    return replacement ? { value: replacement, count: 1 } : { value, count: 0 };
  }
  let count = 0;
  const replace = (entry: unknown) => {
    const result = replaceImageUrls(entry, replacements);
    count += result.count;
    return result.value;
  };
  if (Array.isArray(value)) {
    const result = value.map(replace);
    return { value: result, count };
  }
  if (value && typeof value === "object") {
    const result = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replace(entry)]));
    return { value: result, count };
  }
  return { value, count: 0 };
}

/** Создаёт новые объекты и резервные копии. Удаление исходников здесь отсутствует. */
export async function migrateS3Images(client: S3Client, options: {
  bucket: string;
  publicUrl: string;
  apply?: boolean;
  onProgress?: (message: string) => void;
}): Promise<ImageMigrationReport> {
  const { bucket: Bucket, apply = false, onProgress = () => {} } = options;
  const publicUrl = options.publicUrl.replace(/\/$/, "");
  const url = new URL(publicUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.search || url.hash || url.username || url.password)
    throw new Error("Некорректный S3_PUBLIC_URL");
  const run = `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}`;
  const prefix = `migrations/webp-q95/${run}`;
  const report: ImageMigrationReport = {
    version: 1, quality: 95, mode: apply ? "apply" : "dry-run", status: "running",
    run, bucket: Bucket, publicUrl, manifestKey: `${prefix}/manifest.json`, images: [], skipped: [], catalogs: [],
  };
  const persist = async () => {
    if (apply) await client.send(new PutObjectCommand({
      Bucket, Key: report.manifestKey, Body: JSON.stringify(report, null, 2), ContentType: "application/json",
    }));
  };
  const get = async (Key: string, IfMatch?: string) => {
    const response = await client.send(new GetObjectCommand({ Bucket, Key, IfMatch }));
    if (!response.Body || !response.ETag) throw new Error("Не удалось прочитать объект с ETag");
    return { body: Buffer.from(await response.Body.transformToByteArray()), etag: response.ETag, metadata: response.Metadata };
  };
  const list = async (Prefix: string) => {
    const objects: { Key: string; ETag: string }[] = [];
    let ContinuationToken: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }));
      for (const object of page.Contents ?? []) {
        if (object.Key && object.ETag) objects.push({ Key: object.Key, ETag: object.ETag });
      }
      if (page.IsTruncated && !page.NextContinuationToken) throw new Error("Нет токена следующей страницы S3");
      ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (ContinuationToken);
    return objects;
  };
  const notFound = (error: unknown) => (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404;
  const immutablePut = async (Key: string, body: Buffer, ContentType: string, Metadata?: Record<string, string>) => {
    await client.send(new PutObjectCommand({ Bucket, Key, Body: body, ContentType, Metadata, IfNoneMatch: "*" }));
    if (!(await get(Key)).body.equals(body)) throw new Error("Записанный объект не прошёл проверку");
  };
  try {
    // Сначала создаём все копии. Каталоги меняются только после успешной конвертации всего набора.
    await persist();
    for (const object of await list(imagePrefix)) {
      const key = object.Key;
      if (key.includes(migrationFolder) || !/\.(jpe?g|png|gif|avif|webp)$/i.test(key)) {
        report.skipped.push({ key, reason: key.includes(migrationFolder) ? "migration-output" : "not-a-supported-photo" });
        continue;
      }
      const source = await get(key, object.ETag);
      if (source.metadata?.["webp-quality"] === "95") {
        report.skipped.push({ key, reason: "already-webp-quality-95" });
        continue;
      }
      const body = await convertImageToWebp(source.body);
      // Исходник и его версия входят в имя: повторный запуск использует ту же копию.
      const targetKey = `${key.slice(0, key.lastIndexOf("/"))}${migrationFolder}${hash(`${key}\n${source.etag}`)}.webp`;
      const entry: ImageMigrationEntry = {
        sourceKey: key, sourceETag: source.etag, targetKey,
        originalBytes: source.body.length, webpBytes: body.length, sha256: hash(body),
      };
      report.images.push(entry);
      await persist();
      if (apply) {
        let existing: Awaited<ReturnType<typeof get>> | undefined;
        try { existing = await get(targetKey); } catch (error) { if (!notFound(error)) throw error; }
        if (existing) {
          if (!existing.body.equals(body)) throw new Error("Копия WebP отличается от ожидаемой; перезапись запрещена");
        } else {
          await immutablePut(targetKey, body, "image/webp", { "webp-quality": "95", "source-sha256": hash(source.body) });
        }
      }
      onProgress(`Фотографии: ${report.images.length}; ${source.body.length} → ${body.length} байт`);
    }
    const replacements = new Map(report.images.map((image) => [
      `${publicUrl}/${image.sourceKey}`, `${publicUrl}/${image.targetKey}`,
    ]));
    for (const object of await list("users/")) {
      if (!/^users\/[^/]+\/catalog\.json$/.test(object.Key)) continue;
      const source = await get(object.Key);
      const original: unknown = JSON.parse(source.body.toString("utf8"));
      const rewritten = replaceImageUrls(original, replacements);
      if (!rewritten.count) continue;
      const backupKey = `${prefix}/${object.Key}`;
      const entry: ImageMigrationReport["catalogs"][number] = {
        key: object.Key, backupKey, sourceETag: source.etag, replacements: rewritten.count, status: "planned",
      };
      report.catalogs.push(entry);
      await persist();
      if (apply) {
        // Резервная копия побайтовая: без нормализации, удаления полей или смены схемы.
        await immutablePut(backupKey, source.body, "application/json");
        const body = Buffer.from(JSON.stringify(rewritten.value));
        await client.send(new PutObjectCommand({
          Bucket, Key: object.Key, Body: body, ContentType: "application/json; charset=utf-8", IfMatch: source.etag,
        }));
        const saved = await get(object.Key);
        if (!saved.body.equals(body)) throw new Error("Каталог изменился после записи; проверьте журнал миграции");
        entry.appliedETag = saved.etag;
        entry.status = "applied";
        await persist();
      }
      onProgress(`Каталоги: ${report.catalogs.length}; заменено ссылок: ${rewritten.count}`);
    }
    report.status = "complete";
    await persist();
    return report;
  } catch (error) {
    report.status = "failed";
    try { await persist(); } catch { /* Сохраняем исходную причину ошибки. */ }
    onProgress(apply ? `Миграция остановлена. Журнал: ${report.manifestKey}` : "Предварительная проверка остановлена; записи не выполнялись.");
    throw error;
  }
}
