"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export function ComponentModal({
  children,
  backgroundSelector = "[data-components-background]",
}: {
  children: ReactNode;
  backgroundSelector?: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const background = document.querySelector<HTMLElement>(backgroundSelector);
    const previousInert = background?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (background) background.inert = true;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      if (background) background.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [backgroundSelector]);

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="Карточка компонента"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          event.target instanceof Element &&
          event.target.closest('[role="dialog"]') === event.currentTarget
        ) {
          event.stopPropagation();
          router.back();
        }
      }}
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--color-bg)] outline-none"
    >
      {children}
    </div>
  );
}

export function CloseComponentModal() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="-ml-1 rounded-lg px-2 py-1 text-[var(--color-accent)] transition active:opacity-70"
    >
      Назад
    </button>
  );
}
