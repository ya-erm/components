"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/states";

export default function RegisterPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Не удалось зарегистрироваться");
        return;
      }
      // Сразу логиним пользователя.
      const signInRes = await signIn("credentials", {
        login,
        password,
        redirect: false,
      });
      if (signInRes?.error) {
        setError("Аккаунт создан, но войти не удалось. Попробуйте на странице входа.");
        return;
      }
      router.push("/components");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-8 max-w-sm px-4">
      <h1 className="mb-1 text-2xl font-bold">Регистрация</h1>
      <p className="mb-6 text-sm text-[var(--color-muted)]">
        Создайте аккаунт — у вас будет свой каталог компонентов.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Логин" htmlFor="login" hint="Минимум 3 символа: латиница, цифры, . _ - @">
          <Input
            id="login"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
          />
        </Field>
        <Field label="Пароль" htmlFor="password" hint="Минимум 8 символов">
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <Button type="submit" disabled={loading}>
          {loading ? <Spinner /> : "Зарегистрироваться"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="text-[var(--color-accent)] hover:underline">
          Войти
        </Link>
      </p>
    </div>
  );
}
