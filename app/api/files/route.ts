import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { MAX_ATTACHMENT_PROXY_SIZE, attachmentUploadSchema } from "@/lib/schema";
import { uploadAttachment, createAttachmentUpload } from "@/lib/s3";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (req.headers.get("content-type")?.split(";")[0].trim() === "application/json") {
    const parsed = attachmentUploadSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json({ error: "Укажите имя файла и размер от 1 байта до 20 МБ", issues: parsed.error.flatten() }, { status: 400 });
    const attachment = {
      ...parsed.data,
      id: randomUUID(),
      name: sanitizeName(parsed.data.name),
      createdAt: new Date().toISOString(),
    };
    const upload = await createAttachmentUpload(ownerId, attachment.id, attachment.name, attachment.size);
    return NextResponse.json({ attachment, upload, expiresIn: 300 }, { status: 201, headers: { "Cache-Control": "no-store" } });
  }
  if (Number(req.headers.get("content-length")) > MAX_ATTACHMENT_PROXY_SIZE + 64 * 1024)
    return NextResponse.json({ error: "Для файлов больше 4 МБ используйте прямую загрузку: POST /api/files с JSON {name,size,contentType}" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const files = form?.getAll("file");
  if (!files || files.length !== 1 || !(files[0] instanceof File))
    return NextResponse.json({ error: "Ожидается один файл в поле file (multipart/form-data)" }, { status: 400 });
  const file = files[0];
  if (file.size < 1 || file.size > MAX_ATTACHMENT_PROXY_SIZE)
    return NextResponse.json({ error: "Multipart API поддерживает файлы до 4 МБ. Для файлов до 20 МБ используйте прямую загрузку через JSON." }, { status: 400 });
  const name = sanitizeName(file.name);
  if (!name) return NextResponse.json({ error: "Укажите имя файла" }, { status: 400 });
  const attachment = {
    id: randomUUID(), name, size: file.size,
    contentType: file.type.slice(0, 200) || "application/octet-stream",
    createdAt: new Date().toISOString(),
  };
  await uploadAttachment(ownerId, attachment.id, Buffer.from(await file.arrayBuffer()), name);
  return NextResponse.json(attachment, { status: 201, headers: { "Cache-Control": "no-store" } });
}

function sanitizeName(name: string) {
  return name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(0, 255);
}
