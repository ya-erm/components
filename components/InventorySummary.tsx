import {
  type ComponentData,
  inventoryTotals,
  hasInventoryStatus,
  STATUS_LABELS,
} from "@/lib/schema";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusIcon } from "@/components/StatusIcon";

export function InventorySummary({
  data,
  compact = false,
  showLabels = false,
}: {
  data: Pick<ComponentData, "inventory" | "purchases" | "usages">;
  compact?: boolean;
  showLabels?: boolean;
}) {
  const totals = inventoryTotals(data).filter(
    (total) => total.quantity > 0 || total.unknown,
  );
  const outOfStock = hasInventoryStatus(data, "out_of_stock") &&
    !totals.some((total) => total.status === "in_transit");
  const usedIndex = totals.findIndex((total) => total.status === "used");
  const badges = outOfStock
    ? [
        ...totals.slice(0, usedIndex < 0 ? totals.length : usedIndex),
        { status: "out_of_stock" as const, quantity: 0, unknown: false },
        ...(usedIndex < 0 ? [] : totals.slice(usedIndex)),
      ]
    : totals;
  return (
    <span className={`flex min-w-0 items-center gap-1 ${showLabels ? "flex-wrap" : "overflow-x-auto whitespace-nowrap"}`}>
      {badges.map((total) => {
        const quantity = total.unknown
          ? total.quantity > 0
            ? `${total.quantity}+`
            : "—"
          : String(total.quantity);
        const statusLabel = total.status === "out_of_stock" && showLabels
          ? "В наличии"
          : STATUS_LABELS[total.status];
        const label = `${statusLabel}: ${quantity} шт.${total.unknown ? " (количество части компонентов не указано)" : ""}`;
        return (
          <StatusBadge
            key={total.status}
            status={total.status}
            size={compact ? "compact" : "default"}
            className={compact ? "gap-px" : "gap-0.5"}
            title={label}
            aria-label={label}
          >
            <StatusIcon status={total.status} compact={compact} />
            <span className="tabular-nums" aria-hidden="true">
              {showLabels ? `${statusLabel}: ${quantity}` : quantity}
            </span>
          </StatusBadge>
        );
      })}
    </span>
  );
}
