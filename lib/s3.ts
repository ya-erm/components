import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

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
  return type in EXT_BY_TYPE;
}

/** Загружает один файл в S3 и возвращает публичный URL. */
export async function uploadImage(
  buffer: Buffer,
  contentType: string,
  ownerId: string,
): Promise<string> {
  const ext = EXT_BY_TYPE[contentType] ?? "bin";
  const key = `${PUBLIC_IMAGE_PREFIX}/${ownerId}/${randomUUID()}.${ext}`;

  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
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
    const res = await client().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = await res.Body?.transformToString("utf-8");
    if (!body) return null;
    return JSON.parse(body) as T;
  } catch (e) {
    if (e instanceof NoSuchKey || (e as { name?: string }).name === "NoSuchKey") return null;
    // YC / MinIO могут вернуть 404 как generic S3ServiceException
    if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
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
