import { auth } from "@/auth";
import { headers } from "next/headers";
import { apiTokenOwner } from "./api-tokens";

/** Возвращает id текущего пользователя или null. */
export async function currentUserId(): Promise<string | null> {
  const authorization = (await headers()).get("authorization");
  if (authorization !== null) return apiTokenOwner(authorization);
  const session = await auth();
  return session?.user?.id ?? null;
}
