import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { ComponentStatus, STATUS_LABELS } from "@/lib/schema";

const STATUS_CLASS: Record<ComponentStatus, string> = {
  in_stock:
    "bg-emerald-500/15 border-emerald-600/30 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300",
  in_transit:
    "bg-amber-500/15 border-amber-600/30 text-amber-800 dark:border-amber-500/30 dark:text-amber-300",
  out_of_stock:
    "bg-red-500/15 border-red-600/30 text-red-700 dark:border-red-500/30 dark:text-red-300",
};

export function StatusBadge({
  status,
  children,
  className,
  ...props
}: {
  status?: ComponentStatus | null;
  children?: ReactNode;
} & ComponentProps<"span">) {
  if (!status || !(status in STATUS_LABELS)) return null;
  return (
    <span
      {...props}
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_CLASS[status],
        className,
      )}
    >
      {children ?? STATUS_LABELS[status]}
    </span>
  );
}
