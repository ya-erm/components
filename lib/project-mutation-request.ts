import { NextResponse } from "next/server";
import type { z } from "zod";
import { currentUserId } from "./session";
import { CatalogValidationError } from "./catalog";
import {
  ProjectConflictError,
  ProjectNotFoundError,
} from "./project-mutations";

export async function handleProjectMutation<T>(
  request: Request,
  schema: z.ZodType<T>,
  operation: (ownerId: string, input: T) => Promise<unknown>,
) {
  const ownerId = await currentUserId();
  if (!ownerId)
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  try {
    return NextResponse.json(await operation(ownerId, parsed.data));
  } catch (error) {
    if (error instanceof ProjectNotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof ProjectConflictError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof CatalogValidationError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Ошибка изменения проекта", error);
    return NextResponse.json(
      { error: "Не удалось сохранить изменения проекта" },
      { status: 500 },
    );
  }
}
