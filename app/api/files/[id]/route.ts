import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/session";
import { attachmentDownloadUrl } from "@/lib/s3";
import { attachmentSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 30;
type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  const query = new URL(req.url).searchParams;
  const filename = attachmentSchema.shape.name.safeParse(query.get("name"));
  const url = await attachmentDownloadUrl(ownerId, id, {
    fallbackName: filename.success ? filename.data : undefined,
    previewPdf: query.get("preview") === "pdf",
  });
  if (!url) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  return new Response(null, {
    status: 307,
    headers: { Location: url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}
