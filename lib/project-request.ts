import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { projectSchema } from "@/lib/schema";
import { CatalogValidationError } from "@/lib/catalog";
import { saveProject } from "@/lib/components-repo";

export async function handleProjectSave(request: Request, id?: string) {
  const ownerId = await currentUserId();
  if (!ownerId)
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const parsed = projectSchema.safeParse({ ...body, id: id ?? randomUUID() });
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  try {
    const project = await saveProject(ownerId, parsed.data, id === undefined);
    if (!project)
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    return NextResponse.json(project, { status: id === undefined ? 201 : 200 });
  } catch (error) {
    if (error instanceof CatalogValidationError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Ошибка сохранения проекта", error);
    return NextResponse.json(
      { error: "Не удалось сохранить проект" },
      { status: 500 },
    );
  }
}
