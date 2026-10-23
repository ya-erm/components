import { clsx } from "clsx";
import type { ComponentStatus, Purchase } from "@/lib/schema";

const paths: Record<ComponentStatus | Purchase["status"], string> = {
  planned: "M5 5h14v16H5V5ZM8 3v4M16 3v4M5 10h14M8 14h3M8 17h5",
  in_stock: "m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10M7.5 5l9 4",
  in_transit:
    "M3 6h11v11H3V6Zm11 4h4l3 4v3h-7M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm11 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
  used: "M9 3h6l.5 3 2 1 2.5-1 2 3-2 2v2l2 2-2 3-2.5-1-2 1-.5 3H9l-.5-3-2-1L4 18l-2-3 2-2v-2L2 9l2-3 2.5 1 2-1 .5-3ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  unassigned:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6a3 3 0 1 1 4 3c-1 .5-1 1-1 2M12 17h.01",
  out_of_stock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9 9l6 6M15 9l-6 6",
  delivered: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-4 9 3 3 5-6",
  cancelled: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM6 6l12 12",
};

export function StatusIcon({
  status,
  compact = false,
  className,
}: {
  status: ComponentStatus | Purchase["status"];
  compact?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={clsx(compact ? "size-[9px]" : "size-3", "shrink-0", className)}
    >
      <path d={paths[status]} />
    </svg>
  );
}
