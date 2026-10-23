import { MAX_FILE_SIZE } from "./schema";
import { isAllowedImageType, uploadImage, deleteImageByUrl } from "./s3";
import type { Catalog } from "./catalog";

const SOURCE_IMAGE_DOMAINS = ["alicdn.com", "aliexpress-media.com", "aliexpress.com"];

/** Импортёр обращается только к CDN источника, проверяя также каждый redirect. */
function sourceImageUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !SOURCE_IMAGE_DOMAINS.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)))
    throw new Error("Источник фотографии не поддерживается. Загрузите её через форму компонента.");
  return url;
}

export async function downloadImportImage(raw: string, fetchImage: typeof fetch = fetch) {
  let url = sourceImageUrl(raw);
  const signal = AbortSignal.timeout(15_000);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const response = await fetchImage(url, { redirect: "manual", signal, cache: "no-store" });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location || redirect === 3) throw new Error("Не удалось открыть фотографию источника.");
      url = sourceImageUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error("Не удалось скачать фотографию. Повторите импорт или замените её в карточке.");
    }
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!isAllowedImageType(contentType) || Number(response.headers.get("content-length")) > MAX_FILE_SIZE) {
      await response.body.cancel();
      throw new Error("Фотография должна быть PNG, JPEG, WebP или AVIF размером до 4.5 МБ.");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_FILE_SIZE) {
          await reader.cancel();
          throw new Error("Фотография больше 4.5 МБ.");
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    if (!size) throw new Error("Источник вернул пустую фотографию.");
    return { buffer: Buffer.concat(chunks), contentType };
  }
  throw new Error("Не удалось скачать фотографию.");
}

/** Вызывается только после подтверждения токена; существующие компоненты не меняет. */
export async function copyNewComponentImages(
  current: Catalog, planned: Catalog, ownerId: string,
  uploaded: string[],
  saveImage = uploadImage,
  fetchImage: typeof fetch = fetch,
) {
  const publicUrl = process.env.S3_PUBLIC_URL?.replace(/\/$/, "");
  const existing = new Set(current.items.map((item) => item.id));
  const copied = new Map<string, string>();
  for (const item of planned.items) {
    if (existing.has(item.id)) continue;
    const images: string[] = [];
    for (const url of item.data.images) {
      if (publicUrl && url.startsWith(`${publicUrl}/public/images/`)) {
        images.push(url);
        continue;
      }
      if (!publicUrl) throw new Error("Не настроено хранилище фотографий.");
      let ownUrl = copied.get(url);
      if (!ownUrl) {
        const image = await downloadImportImage(url, fetchImage);
        ownUrl = await saveImage(image.buffer, image.contentType, ownerId);
        uploaded.push(ownUrl);
        copied.set(url, ownUrl);
      }
      images.push(ownUrl);
    }
    item.data.images = images;
  }
}

/** При неопределённом результате записи сначала проверяем фактические ссылки каталога. */
export async function removeUnusedImportImages(urls: string[], persisted: Catalog, remove = deleteImageByUrl) {
  const referenced = new Set(persisted.items.flatMap((item) => item.data.images));
  await Promise.all(urls.filter((url) => !referenced.has(url)).map(remove));
}
