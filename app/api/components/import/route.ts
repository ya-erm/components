import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import {
  componentDataSchema,
  logisticsSchema,
  type ComponentData,
} from "@/lib/schema";
import { CatalogValidationError } from "@/lib/catalog";
import { importComponents } from "@/lib/components-repo";

export const runtime = "nodejs";

const MAX_IMPORT = 5000;

/** Достаёт массив записей из тела: поддерживаем формат экспорта и «голый» массив. */
function extractEntries(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (
    body &&
    typeof body === "object" &&
    Array.isArray((body as { components?: unknown }).components)
  ) {
    return (body as { components: unknown[] }).components;
  }
  return null;
}

export async function POST(req: Request) {
  const ownerId = await currentUserId();
  if (!ownerId)
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Файл не является корректным JSON" },
      { status: 400 },
    );
  }

  const entries = extractEntries(body);
  const envelope =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  if (
    envelope.version !== undefined &&
    envelope.version !== 1 &&
    envelope.version !== 2
  ) {
    return NextResponse.json(
      { error: "Неподдерживаемая версия экспорта" },
      { status: 400 },
    );
  }
  const logistics = logisticsSchema.safeParse({
    orders: envelope.orders,
    shipments: envelope.shipments,
    projects: envelope.projects,
    ignoredAliItems: envelope.ignoredAliItems,
  });
  if (!logistics.success)
    return NextResponse.json(
      { error: "Некорректные заказы или посылки" },
      { status: 400 },
    );
  if (!entries) {
    return NextResponse.json(
      {
        error:
          "Ожидается массив компонентов или объект экспорта { components: [...] }",
      },
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
    if (
      entry &&
      typeof entry === "object" &&
      "data" in entry &&
      typeof (entry as { data: unknown }).data === "object"
    ) {
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

  try {
    const { created, updated } = await importComponents(
      ownerId,
      valid,
      logistics.data,
    );
    return NextResponse.json({
      created,
      updated,
      skipped,
      total: entries.length,
    });
  } catch (error) {
    if (error instanceof CatalogValidationError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
