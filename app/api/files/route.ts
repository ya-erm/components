import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { MAX_ATTACHMENT_SIZE } from "@/lib/schema";
import { uploadAttachment } from "@/lib/s3";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (Number(req.headers.get("content-length")) > MAX_ATTACHMENT_SIZE + 64 * 1024)
    return NextResponse.json({ error: "Максимальный размер файла — 4 МБ" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const files = form?.getAll("file");
  if (!files || files.length !== 1 || !(files[0] instanceof File))
    return NextResponse.json({ error: "Ожидается один файл в поле file (multipart/form-data)" }, { status: 400 });
  const file = files[0];
  if (file.size < 1 || file.size > MAX_ATTACHMENT_SIZE)
    return NextResponse.json({ error: "Размер файла должен быть от 1 байта до 4 МБ" }, { status: 400 });
  const name = file.name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(0, 255);
  if (!name) return NextResponse.json({ error: "Укажите имя файла" }, { status: 400 });
  const attachment = {
    id: randomUUID(), name, size: file.size,
    contentType: file.type.slice(0, 200) || "application/octet-stream",
    createdAt: new Date().toISOString(),
  };
  await uploadAttachment(ownerId, attachment.id, Buffer.from(await file.arrayBuffer()), name);
  return NextResponse.json(attachment, { status: 201, headers: { "Cache-Control": "no-store" } });
}
