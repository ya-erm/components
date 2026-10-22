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
  const [passwordVisible, setPasswordVisible] = useState(false);
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
          <div className="relative">
            <Input
              id="password"
              type={passwordVisible ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="pr-12"
              required
            />
            <button
              type="button"
              aria-label={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
              aria-controls="password"
              onClick={() => setPasswordVisible((visible) => !visible)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-xl text-[var(--color-muted)] transition hover:text-[var(--color-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="size-5"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {passwordVisible ? <path d="m3 3 18 18" /> : null}
              </svg>
            </button>
          </div>
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
