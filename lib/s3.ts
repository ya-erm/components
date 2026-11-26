import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";

/**
 * S3-совместимое хранилище (AWS S3 / Yandex Cloud / MinIO).
 * Конфиг целиком из переменных окружения — секретов в коде нет.
 */

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Не задана переменная окружения ${name}`);
  return v;
}

const BUCKET = process.env.S3_BUCKET ?? "components";
const PUBLIC_URL = (process.env.S3_PUBLIC_URL ?? "").replace(/\/$/, "");

// Изображения кладём под публичный префикс. Приватные данные (если появятся) —
// под другие префиксы (напр. users/), на которые публичная политика не распространяется.
const PUBLIC_IMAGE_PREFIX = "public/images";

let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    // endpoint пустой => нативный AWS S3; иначе MinIO / Yandex Cloud и т.п.
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: env("S3_ACCESS_KEY_ID"),
      secretAccessKey: env("S3_SECRET_ACCESS_KEY"),
    },
  });
  return _client;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export function isAllowedImageType(type: string): boolean {
  return Object.hasOwn(EXT_BY_TYPE, type);
}

/** Конвертирует фотографию в WebP (качество 95) и возвращает публичный URL. */
export async function uploadImage(
  buffer: Buffer,
  contentType: string,
  ownerId: string,
): Promise<string> {
  if (!isAllowedImageType(contentType)) {
    throw new Error("Недопустимый тип фотографии");
  }
  const webp = await sharp(buffer, { animated: true })
    .rotate()
    .webp({ quality: 95 })
    .toBuffer();
  const key = `${PUBLIC_IMAGE_PREFIX}/${ownerId}/${randomUUID()}.webp`;

  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: webp,
      ContentType: "image/webp",
    }),
  );

  if (!PUBLIC_URL) {
    throw new Error("Не задана переменная окружения S3_PUBLIC_URL");
  }
  return `${PUBLIC_URL}/${key}`;
}

/**
 * Читает JSON-объект из S3. Возвращает null если ключ не существует.
 * Используется для хранения пользовательских данных в приватном префиксе users/.
 */
export async function getJson<T>(key: string): Promise<T | null> {
  try {
    const res = await client().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    const body = await res.Body?.transformToString("utf-8");
    if (!body) return null;
    return JSON.parse(body) as T;
  } catch (e) {
    if (e instanceof NoSuchKey || (e as { name?: string }).name === "NoSuchKey")
      return null;
    // YC / MinIO могут вернуть 404 как generic S3ServiceException
    if (
      (e as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode === 404
    )
      return null;
    throw e;
  }
}

/** Записывает JSON-объект в S3 (полная перезапись ключа). */
export async function putJson<T>(key: string, value: T): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: JSON.stringify(value),
      ContentType: "application/json; charset=utf-8",
    }),
  );
}

/** Файлы не попадают под публичную политику public/*. */
export async function uploadAttachment(ownerId: string, id: string, buffer: Buffer, name: string) {
  await client().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: `users/${ownerId}/files/${id}`,
    Body: buffer,
    ContentType: "application/octet-stream",
    Metadata: { filename: encodeURIComponent(name) },
  }));
}

/** Подпись ограничивает конкретный приватный ключ, размер и метаданные файла. */
export async function createAttachmentUpload(ownerId: string, id: string, name: string, size: number) {
  const url = await getSignedUrl(client(), new PutObjectCommand({
    Bucket: BUCKET,
    Key: `users/${ownerId}/files/${id}`,
    ContentLength: size,
    ContentType: "application/octet-stream",
    Metadata: { filename: encodeURIComponent(name) },
  }), { expiresIn: 300 });
  return { url, method: "PUT" as const, headers: { "Content-Type": "application/octet-stream" } };
}

function attachmentDisposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function attachmentDownloadUrl(ownerId: string, id: string) {
  const Key = `users/${ownerId}/files/${id}`;
  try {
    const object = await client().send(new HeadObjectCommand({ Bucket: BUCKET, Key }));
    const name = decodeURIComponent(object.Metadata?.filename ?? "file").replace(/[\r\n]/g, "_");
    return getSignedUrl(client(), new GetObjectCommand({
      Bucket: BUCKET, Key,
      ResponseContentType: "application/octet-stream",
      ResponseContentDisposition: attachmentDisposition(name),
      ResponseCacheControl: "private, no-store",
    }), { expiresIn: 60 });
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

/** Версия объекта для условной записи после предпросмотра импорта. */
export async function getJsonVersioned<T>(
  key: string,
): Promise<{ value: T | null; etag?: string }> {
  try {
    const result = await client().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    const body = await result.Body?.transformToString("utf-8");
    return { value: body ? (JSON.parse(body) as T) : null, etag: result.ETag };
  } catch (error) {
    if (
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode === 404
    )
      return { value: null };
    throw error;
  }
}

export async function putJsonConditional<T>(
  key: string,
  value: T,
  etag?: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: JSON.stringify(value),
      ContentType: "application/json; charset=utf-8",
      ...(etag ? { IfMatch: etag } : { IfNoneMatch: "*" }),
    }),
  );
}

/** Удаляет объект по публичному URL (best-effort, ошибки не критичны). */
export async function deleteImageByUrl(url: string): Promise<void> {
  if (!PUBLIC_URL || !url.startsWith(PUBLIC_URL)) return;
  const key = url.slice(PUBLIC_URL.length + 1);
  if (!key) return;
  try {
    await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    // не блокируем основной поток из-за проблемы удаления файла
  }
}
