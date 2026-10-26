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
  return (
    <span className={`flex min-w-0 items-center gap-1 ${showLabels ? "flex-wrap" : "overflow-x-auto whitespace-nowrap"}`}>
      {totals.map((total) => {
        const quantity = total.unknown
          ? total.quantity > 0
            ? `${total.quantity}+`
            : "—"
          : String(total.quantity);
        const label = `${STATUS_LABELS[total.status]}: ${quantity} шт.${total.unknown ? " (количество части компонентов не указано)" : ""}`;
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
              {showLabels ? `${STATUS_LABELS[total.status]}: ${quantity}` : quantity}
            </span>
          </StatusBadge>
        );
      })}
      {hasInventoryStatus(data, "out_of_stock") &&
      !totals.some((total) => total.status === "in_transit") ? (
        <StatusBadge
          status="out_of_stock"
          size={compact ? "compact" : "default"}
          className={compact ? "gap-px" : "gap-0.5"}
          title="Нет в наличии: 0 шт."
          aria-label="Нет в наличии: 0 шт."
        >
          <StatusIcon status="out_of_stock" compact={compact} />
          <span className="tabular-nums" aria-hidden="true">
            {showLabels ? "Нет в наличии: 0" : "0"}
          </span>
        </StatusBadge>
      ) : null}
    </span>
  );
}
