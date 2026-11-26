import { type Purchase, PURCHASE_LABELS } from "@/lib/schema";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusIcon } from "@/components/StatusIcon";

export function OrderSummaryBadges({ purchases }: { purchases: Purchase[] }) {
  return (
    <>
      {purchases.map((purchase, index) => {
        const badgeStatus = purchase.status === "delivered"
          ? "in_stock"
          : purchase.status === "cancelled"
            ? "out_of_stock"
            : purchase.status;
        const label = `Заказ ${index + 1}: ${PURCHASE_LABELS[purchase.status]}, ${purchase.quantity === undefined ? "количество неизвестно" : `${purchase.quantity} шт.`}`;
        return (
          <StatusBadge
            key={purchase.id}
            status={badgeStatus}
            size="compact"
            className="gap-px"
            title={label}
            aria-label={label}
          >
            <StatusIcon status={purchase.status} compact />
            <span className="tabular-nums" aria-hidden="true">{purchase.quantity ?? "—"}</span>
          </StatusBadge>
        );
      })}
      {!purchases.length ? <span className="text-xs text-[var(--color-muted)]">Нет заказов</span> : null}
    </>
  );
}
