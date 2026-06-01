import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { componentDataSchema, type ComponentData } from "@/lib/schema";
import { importComponents } from "@/lib/components-repo";

export const runtime = "nodejs";

const MAX_IMPORT = 5000;

/** Достаёт массив записей из тела: поддерживаем формат экспорта и «голый» массив. */
function extractEntries(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object" && Array.isArray((body as { components?: unknown }).components)) {
    return (body as { components: unknown[] }).components;
  }
  return null;
}

export async function POST(req: Request) {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Файл не является корректным JSON" }, { status: 400 });
  }

  const entries = extractEntries(body);
  if (!entries) {
    return NextResponse.json(
      { error: "Ожидается массив компонентов или объект экспорта { components: [...] }" },
      { status: 400 },
    );
  }
  if (entries.length > MAX_IMPORT) {
    return NextResponse.json(
      { error: `Слишком много записей (макс. ${MAX_IMPORT})` },
      { status: 400 },
    );
  }

  const valid: { id?: string; data: ComponentData }[] = [];
  let skipped = 0;

  for (const entry of entries) {
    // Запись может быть { id, data } (формат экспорта) или «голым» объектом данных.
    let id: string | undefined;
    let rawData: unknown;
    if (entry && typeof entry === "object" && "data" in entry && typeof (entry as { data: unknown }).data === "object") {
      const e = entry as { id?: unknown; data: unknown };
      id = typeof e.id === "string" ? e.id : undefined;
      rawData = e.data;
    } else {
      rawData = entry;
    }

    const parsed = componentDataSchema.safeParse(rawData);
    if (!parsed.success) {
      skipped++;
      continue;
    }
    valid.push({ id, data: parsed.data });
  }

  const { created, updated } = await importComponents(ownerId, valid);

  return NextResponse.json({ created, updated, skipped, total: entries.length });
}
