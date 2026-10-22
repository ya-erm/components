import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/session";
import { readCatalog, applyAliImport } from "@/lib/components-repo";
import {
  aliExportSchema,
  aliSelectionSchema,
  analyzeAli,
  planAliImport,
  AliImportError,
  AliConflictError,
} from "@/lib/aliexpress";
import { CatalogValidationError } from "@/lib/catalog";

export const runtime = "nodejs";
const requestSchema = z.object({
  action: z.enum(["analyze", "preview", "apply"]),
  data: aliExportSchema,
  selections: z.array(aliSelectionSchema).max(5000).default([]),
  token: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  const ownerId = await currentUserId();
  if (!ownerId)
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > 4 * 1024 * 1024)
    return NextResponse.json(
      { error: "Файл слишком большой. Максимум 4 МБ." },
      { status: 413 },
    );
  try {
    const input = requestSchema.parse(JSON.parse(raw));
    if (input.action === "apply") {
      if (!input.token) throw new AliImportError("Сначала проверьте изменения");
      return NextResponse.json(
        await applyAliImport(
          ownerId,
          input.data,
          input.selections,
          input.token,
        ),
      );
    }
    const catalog = await readCatalog(ownerId);
    return NextResponse.json(
      input.action === "analyze"
        ? analyzeAli(catalog, input.data)
        : planAliImport(catalog, input.data, input.selections).preview,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AliConflictError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (
      error instanceof AliImportError ||
      error instanceof CatalogValidationError
    )
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: `Некорректные данные: ${error.issues[0]?.path.join(".")}: ${error.issues[0]?.message}`,
        },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { error: "Файл не является корректным JSON" },
        { status: 400 },
      );
    throw error;
  }
}
