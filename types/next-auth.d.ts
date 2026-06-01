import type { DefaultSession } from "next-auth";

// Расширяем типы Auth.js: добавляем user.id в сессию и id в JWT.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
