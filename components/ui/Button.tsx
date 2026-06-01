import { clsx } from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:opacity-90 active:opacity-80",
  secondary:
    "bg-[var(--color-surface-2)] text-[var(--color-fg)] border border-[var(--color-border)] hover:bg-[var(--color-border)]",
  ghost: "text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]",
  danger: "bg-red-600/90 text-white hover:bg-red-600",
  "danger-outline":
    "border border-red-500/40 text-red-500 bg-transparent hover:bg-red-500/10 dark:text-red-400",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none select-none";

/** Классы кнопки для случаев, когда нужен не <button>/<Link>, а, например, <a download>. */
export function buttonClass(variant: Variant = "primary", className?: string) {
  return clsx(BASE, VARIANTS[variant], className);
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={clsx(BASE, VARIANTS[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; children: ReactNode }) {
  return (
    <Link className={clsx(BASE, VARIANTS[variant], className)} {...props}>
      {children}
    </Link>
  );
}
