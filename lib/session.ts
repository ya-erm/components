import { auth } from "@/auth";

/** Возвращает id текущего пользователя или null. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
