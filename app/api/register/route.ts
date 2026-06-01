import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { findByLogin, createUser } from "@/lib/users-repo";

export const runtime = "nodejs";

const registerSchema = z.object({
  login: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Логин не короче 3 символов")
    .max(50, "Логин слишком длинный")
    .regex(/^[a-z0-9._@-]+$/i, "Допустимы латиница, цифры и . _ - @"),
  password: z
    .string()
    .min(8, "Пароль не короче 8 символов")
    .max(100, "Пароль слишком длинный"),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ошибка валидации" },
      { status: 400 },
    );
  }

  const { login, password } = parsed.data;

  const existing = await findByLogin(login);
  if (existing) {
    return NextResponse.json({ error: "Логин уже занят" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await createUser(login, passwordHash);

  return NextResponse.json({ ok: true }, { status: 201 });
}
