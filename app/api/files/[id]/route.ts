import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/session";
import { getAttachment } from "@/lib/s3";

export const runtime = "nodejs";
export const maxDuration = 30;
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  const object = await getAttachment(ownerId, id);
  if (!object?.Body) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  const name = decodeURIComponent(object.Metadata?.filename ?? "file").replace(/[\r\n]/g, "_");
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(object.Body.transformToWebStream(), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      ...(object.ContentLength !== undefined ? { "Content-Length": String(object.ContentLength) } : {}),
    },
  });
}
