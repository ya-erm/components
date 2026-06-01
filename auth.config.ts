import type { NextAuthConfig } from "next-auth";

/**
 * Edge-совместимая часть конфига Auth.js (без Prisma и bcrypt).
 * Используется в middleware. Полный конфиг с Credentials — в auth.ts.
 */

// Страницы и эндпоинты, доступные без авторизации.
const PUBLIC_PATHS = ["/login", "/register", "/api/register"];
// Страницы входа/регистрации, с которых авторизованного редиректим в каталог.
const AUTH_PAGES = ["/login", "/register"];

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [], // провайдеры добавляются в auth.ts (Node-рантайм)
  callbacks: {
    // Прокидываем id пользователя в токен и сессию.
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
    // Защита маршрутов: всё закрыто, кроме /login и /register.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const path = nextUrl.pathname;
      const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

      if (isPublic) {
        // Залогиненного со страниц входа/регистрации отправляем в каталог.
        if (isLoggedIn && AUTH_PAGES.includes(path)) {
          return Response.redirect(new URL("/components", nextUrl));
        }
        return true;
      }

      // Остальные страницы — только для авторизованных.
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
