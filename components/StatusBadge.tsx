import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { ComponentStatus, STATUS_LABELS } from "@/lib/schema";

type StatusBadgeVariant = "default" | "overlay";

const STATUS_CLASS: Record<StatusBadgeVariant, Record<ComponentStatus, string>> = {
  default: {
    in_stock:
      "bg-emerald-500/15 border-emerald-600/30 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300",
    in_transit:
      "bg-amber-500/15 border-amber-600/30 text-amber-800 dark:border-amber-500/30 dark:text-amber-300",
    out_of_stock:
      "bg-red-500/15 border-red-600/30 text-red-700 dark:border-red-500/30 dark:text-red-300",
  },
  overlay: {
    in_stock:
      "border-[#a7e7cf] bg-[#e7f8f2] text-emerald-800",
    in_transit:
      "border-[#f7d8a8] bg-[#fef5e7] text-amber-900",
    out_of_stock:
      "border-[#f5bcbc] bg-[#fdecec] text-red-800",
  },
};

export function StatusBadge({
  status,
  children,
  className,
  variant = "default",
  ...props
}: {
  status?: ComponentStatus | null;
  children?: ReactNode;
  variant?: StatusBadgeVariant;
} & ComponentProps<"span">) {
  if (!status || !(status in STATUS_LABELS)) return null;
  return (
    <span
      {...props}
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_CLASS[variant][status],
        className,
      )}
    >
      {children ?? STATUS_LABELS[status]}
    </span>
  );
}
