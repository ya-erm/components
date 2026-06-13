import { NextResponse } from "next/server";
import { listComponents } from "@/lib/components-repo";
import { currentUserId } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 30;

const IMAGE_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function GET(req: Request) {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const requestUrl = new URL(req.url);
  const rawUrl = requestUrl.searchParams.get("url");
  if (!rawUrl) return NextResponse.json({ error: "Не задан url" }, { status: 400 });

  let imageUrl: URL;
  try {
    imageUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Некорректный url" }, { status: 400 });
  }

  if (imageUrl.protocol !== "http:" && imageUrl.protocol !== "https:") {
    return NextResponse.json({ error: "Некорректный протокол" }, { status: 400 });
  }

  if (!(await canDownloadImage(ownerId, imageUrl))) {
    return NextResponse.json({ error: "Изображение недоступно" }, { status: 403 });
  }

  const upstream = await fetch(imageUrl, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Не удалось скачать изображение" }, { status: 502 });
  }

  const contentType = normalizeImageContentType(upstream.headers.get("content-type"));
  const filename = filenameFromUrl(imageUrl, contentType);

  return new Response(upstream.body, {
    headers: {
      "Content-Disposition": contentDisposition(filename),
      "Content-Type": contentType,
    },
  });
}

async function canDownloadImage(ownerId: string, imageUrl: URL): Promise<boolean> {
  if (!isAllowedImageOrigin(imageUrl)) return false;
  if (imageUrl.pathname.includes(`/public/images/${ownerId}/`)) return true;

  const catalog = await listComponents({ ownerId, all: true });
  return catalog.items.some((item) => item.data.images?.includes(imageUrl.toString()));
}

function isAllowedImageOrigin(imageUrl: URL): boolean {
  const allowedOrigins = new Set(["http://localhost:9000", "http://127.0.0.1:9000"]);
  const publicUrl = process.env.S3_PUBLIC_URL;

  if (publicUrl) {
    try {
      allowedOrigins.add(new URL(publicUrl).origin);
    } catch {
      // Некорректный S3_PUBLIC_URL не расширяет список разрешённых origin.
    }
  }

  return allowedOrigins.has(imageUrl.origin);
}

function normalizeImageContentType(contentType: string | null): string {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (normalized && IMAGE_CONTENT_TYPES.has(normalized)) return normalized;
  return "application/octet-stream";
}

function filenameFromUrl(url: URL, contentType: string): string {
  const lastSegment = url.pathname.split("/").filter(Boolean).at(-1);
  const decoded = lastSegment ? decodeURIComponent(lastSegment) : "";
  const safeName = decoded.replace(/[\\/:*?"<>|]/g, "_").trim();
  if (safeName) return safeName;
  return `component-photo.${extensionByContentType(contentType)}`;
}

function extensionByContentType(contentType: string): string {
  switch (contentType) {
    case "image/avif":
      return "avif";
    case "image/gif":
      return "gif";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    default:
      return "jpg";
  }
}

function contentDisposition(filename: string): string {
  const asciiName = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "_");
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeRFC5987Value(filename)}`;
}

function encodeRFC5987Value(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
