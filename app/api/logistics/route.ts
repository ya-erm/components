import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { logisticsSchema } from "@/lib/schema";
import { getLogistics, saveLogistics, CatalogConflictError } from "@/lib/components-repo";
import { CatalogValidationError } from "@/lib/catalog";

export const runtime = "nodejs";

export async function GET() {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  return NextResponse.json(await getLogistics(ownerId), { headers: { "Cache-Control": "no-store" } });
}

/** Коллекции объединяются по id, отсутствующие записи сохраняются. */
export async function PATCH(req: Request) {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const parsed = logisticsSchema.strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ошибка валидации", issues: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(await saveLogistics(ownerId, parsed.data));
  } catch (error) {
    if (error instanceof CatalogConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof CatalogValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
