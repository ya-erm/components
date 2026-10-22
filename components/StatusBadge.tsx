import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { type ComponentStatus, STATUS_LABELS } from "@/lib/schema";

type StatusBadgeVariant = "default" | "overlay";

const STATUS_CLASS: Record<
  StatusBadgeVariant,
  Record<ComponentStatus, string>
> = {
  default: {
    planned:
      "bg-violet-500/15 border-violet-500/30 text-violet-700 dark:text-violet-300",
    used: "bg-blue-500/15 border-blue-600/30 text-blue-700 dark:text-blue-300",
    unassigned:
      "bg-slate-500/15 border-slate-500/30 text-slate-600 dark:text-slate-300",
    in_stock:
      "bg-emerald-500/15 border-emerald-600/30 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300",
    in_transit:
      "bg-amber-500/15 border-amber-600/30 text-amber-800 dark:border-amber-500/30 dark:text-amber-300",
    out_of_stock:
      "bg-red-500/15 border-red-600/30 text-red-700 dark:border-red-500/30 dark:text-red-300",
  },
  overlay: {
    planned: "border-violet-200 bg-violet-50 text-violet-800",
    used: "border-blue-200 bg-blue-50 text-blue-800",
    unassigned: "border-slate-200 bg-slate-50 text-slate-700",
    in_stock: "border-[#a7e7cf] bg-[#e7f8f2] text-emerald-800",
    in_transit: "border-[#f7d8a8] bg-[#fef5e7] text-amber-900",
    out_of_stock: "border-[#f5bcbc] bg-[#fdecec] text-red-800",
  },
};

export function StatusBadge({
  status,
  children,
  className,
  variant = "default",
  size = "default",
  ...props
}: {
  status?: ComponentStatus | null;
  children?: ReactNode;
  variant?: StatusBadgeVariant;
  size?: "default" | "compact";
} & ComponentProps<"span">) {
  if (!status || !(status in STATUS_LABELS)) return null;
  return (
    <span
      {...props}
      className={clsx(
        "inline-flex shrink-0 items-center rounded-full py-0.5 font-medium",
        size === "compact" ? "px-1 text-[10px]" : "border px-1 text-xs",
        STATUS_CLASS[variant][status],
        className,
      )}
    >
      {children ?? STATUS_LABELS[status]}
    </span>
  );
}
