import { ProjectConflictError } from "@/lib/project-mutations";
import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { componentSaveSchema } from "@/lib/schema";
import { CatalogValidationError } from "@/lib/catalog";
import { createComponent, listComponents } from "@/lib/components-repo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ownerId = await currentUserId();
  if (!ownerId)
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const status = searchParams.get("status") ?? undefined;
  const type = searchParams.get("type") ?? undefined;
  const tag = searchParams.get("tag") ?? undefined;
  const all = searchParams.get("all") === "1";

  const result = await listComponents({
    ownerId,
    query,
    page,
    status,
    type,
    tag,
    all,
  });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const ownerId = await currentUserId();
  if (!ownerId)
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const parsed = componentSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ошибка валидации", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const created = await createComponent(
      ownerId,
      parsed.data.data,
      parsed.data.logistics,
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectConflictError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof CatalogValidationError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
