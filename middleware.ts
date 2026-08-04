import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Защита маршрутов через edge-совместимый конфиг (логика в authConfig.callbacks.authorized).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Пропускаем статику, ассеты и сам эндпоинт авторизации; всё остальное проходит проверку.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
