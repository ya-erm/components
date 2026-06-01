"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/states";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      login,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Неверный логин или пароль");
      return;
    }
    router.push("/components");
    router.refresh();
  }

  return (
    <div className="mx-auto mt-8 max-w-sm px-4">
      <h1 className="mb-1 text-2xl font-bold">Вход</h1>
      <p className="mb-6 text-sm text-[var(--color-muted)]">
        Войдите, чтобы управлять компонентами.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Логин" htmlFor="login">
          <Input
            id="login"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
          />
        </Field>
        <Field label="Пароль" htmlFor="password">
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <Button type="submit" disabled={loading}>
          {loading ? <Spinner /> : "Войти"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
        Нет аккаунта?{" "}
        <Link href="/register" className="text-[var(--color-accent)] hover:underline">
          Зарегистрироваться
        </Link>
      </p>
    </div>
  );
}
