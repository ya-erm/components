import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { createApiToken, listApiTokens, revokeApiToken, tokenInputSchema, TokenConflictError } from "@/lib/api-tokens";

export const runtime = "nodejs";

async function sessionOwner(req: Request, write = false) {
  // Агент не может выпускать себе новые токены. Cookie-only + same-origin mutations.
  if (req.headers.has("authorization")) return null;
  if (write && req.headers.get("origin") !== new URL(req.url).origin) return null;
  return (await auth())?.user?.id ?? null;
}

export async function GET(req: Request) {
  const ownerId = await sessionOwner(req);
  if (!ownerId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  return NextResponse.json(await listApiTokens(ownerId), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const ownerId = await sessionOwner(req, true);
  if (!ownerId) return NextResponse.json({ error: "Требуется сессия и запрос из настроек" }, { status: 401 });
  const input = tokenInputSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Укажите название и срок от 1 до 365 дней" }, { status: 400 });
  try {
    return NextResponse.json(await createApiToken(ownerId, input.data), {
      status: 201, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TokenConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export async function DELETE(req: Request) {
  const ownerId = await sessionOwner(req, true);
  if (!ownerId) return NextResponse.json({ error: "Требуется сессия и запрос из настроек" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Укажите id токена" }, { status: 400 });
  try {
    const found = await revokeApiToken(ownerId, id);
    return NextResponse.json(found ? { ok: true } : { error: "Токен не найден" }, { status: found ? 200 : 404 });
  } catch (error) {
    if (error instanceof TokenConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
