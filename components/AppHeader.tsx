"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, type ReactNode } from "react";
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
  title: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const leftSlot = leftRef.current;
    const rightSlot = rightRef.current;
    if (!container || !leftSlot || !rightSlot) return;

    // Одинаковые боковые колонки сохраняют центр и место для обеих групп кнопок.
    const measure = () => {
      const width = Math.ceil(
        Math.max(
          leftSlot.getBoundingClientRect().width,
          rightSlot.getBoundingClientRect().width,
        ),
      );
      container.style.setProperty("--header-side-width", `${width}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(leftSlot);
    observer.observe(rightSlot);
    return () => observer.disconnect();
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 pt-[env(safe-area-inset-top)] backdrop-blur before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-z-10 before:h-24 before:bg-[linear-gradient(180deg,var(--color-bg),transparent)] before:content-['']">
      <div
        ref={containerRef}
        className="mx-auto grid h-14 max-w-5xl grid-cols-[var(--header-side-width,5rem)_minmax(0,1fr)_var(--header-side-width,5rem)] items-center gap-[5px] px-2 sm:px-4"
      >
        <div
          ref={leftRef}
          className="flex w-max min-w-0 items-center justify-self-start"
        >
          {left}
        </div>
        <h1 className="min-w-0 truncate text-center text-base font-semibold">
          {title}
        </h1>
        <div
          ref={rightRef}
          className="flex w-max min-w-0 items-center justify-self-end"
        >
          {right}
        </div>
      </div>
    </header>
  );
}

/** Кнопка «‹ Назад» в левом слоте. */
export function BackLink({
  href,
  label = "Назад",
  scroll,
  prefetch,
}: {
  href: string;
  label?: string;
  scroll?: boolean;
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={scroll}
      prefetch={prefetch}
      className="-ml-1 inline-flex items-center gap-0.5 rounded-lg py-1 pr-2 pl-1 text-[var(--color-accent)] transition active:opacity-70"
    >
      <ChevronLeftIcon className="size-5 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
