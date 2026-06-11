import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/ui/Field";

/**
 * Навигационная шапка в стиле iOS: заголовок по центру, слева/справа —
 * опциональные слоты (кнопка «Назад» и действие). Используется на каждой странице.
 */
export function AppHeader({
  title,
  left,
  right,
}: {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 backdrop-blur before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-z-10 before:h-24 before:bg-[linear-gradient(180deg,var(--color-bg),transparent)] before:content-['']">
      <div className="mx-auto grid h-14 max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 sm:px-4">
        <div className="flex min-w-0 items-center justify-start">{left}</div>
        <h1 className="truncate px-1 text-center text-base font-semibold">{title}</h1>
        <div className="flex min-w-0 items-center justify-end">{right}</div>
      </div>
    </header>
  );
}

/** Кнопка «‹ Назад» в левом слоте. */
export function BackLink({ href, label = "Назад" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="-ml-1 inline-flex items-center gap-0.5 rounded-lg py-1 pr-2 pl-1 text-[var(--color-accent)] transition active:opacity-70"
    >
      <ChevronLeftIcon className="size-5 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
