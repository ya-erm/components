import Image from "next/image";
import Link from "next/link";
import { ComponentDTO } from "@/lib/components-repo";
import { STATUS_LABELS, mainImage } from "@/lib/schema";
import { StatusBadge } from "@/components/StatusBadge";

export function ComponentCard({
  item,
  hideType = false,
  variant = "default",
}: {
  item: ComponentDTO;
  hideType?: boolean;
  variant?: "default" | "compact";
}) {
  const img = mainImage(item.data);
  const qty = item.data.quantity;
  const hasNote = Boolean(item.data.note?.trim());
  const tags = item.data.tags ?? [];
  const compact = variant === "compact";

  return (
    <Link
      href={`/components/${item.id}`}
      className={compact
        ? "group flex flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition active:scale-[0.99]"
        : "group flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition active:scale-[0.99]"}
    >
      <div className="relative aspect-square w-full bg-[var(--color-surface-2)]">
        {img ? (
          <Image
            src={img}
            alt={item.data.name}
            fill
            sizes={compact ? "(max-width: 768px) 33vw, 160px" : "(max-width: 768px) 50vw, 240px"}
            className="object-cover transition group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <NoImageIcon className="size-[50%]" />
          </div>
        )}
        {item.data.status ? (
          <div className={compact ? "absolute left-1.5 top-1.5" : "absolute left-2 top-2"}>
            <StatusBadge
              status={item.data.status}
              variant="overlay"
              aria-label={`${STATUS_LABELS[item.data.status]}: ${formatQuantity(qty)}`}
              title={`${STATUS_LABELS[item.data.status]}: ${formatQuantity(qty)}`}
              className={compact ? "gap-1 px-1 text-[10px] leading-4" : "gap-1.5 px-1.5"}
            >
              <span>{formatQuantity(qty)}</span>
            </StatusBadge>
          </div>
        ) : null}
      </div>

      <div className={compact ? "flex flex-1 flex-col p-1.5" : "flex flex-1 flex-col p-2"}>
        <div className={compact ? "flex items-start gap-1" : "flex items-start gap-1.5"}>
          <h3
            className={compact
              ? "line-clamp-2 min-w-0 flex-1 text-xs font-medium leading-tight"
              : "line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug"}
          >
            {item.data.name}
          </h3>
          {hasNote ? (
            <span
              aria-label="Есть заметка"
              title="Есть заметка"
              className={compact
                ? "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)]"
                : "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)]"}
            >
              <NoteIcon className={compact ? "size-3.5" : "size-4"} />
            </span>
          ) : null}
        </div>
        {!compact && !hideType && item.data.type ? (
          <span className="truncate text-xs text-[var(--color-muted)]">{item.data.type}</span>
        ) : null}
        {!compact && tags.length > 0 ? (
          <div className="flex flex-wrap gap-1 pt-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="max-w-full truncate rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] leading-4 text-[var(--color-muted)]"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export function NoImageIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`text-[var(--color-border)] ${className ?? ""}`}
    >
      <rect x="7" y="7" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9.5 7V4M12 7V4M14.5 7V4M9.5 17V20M12 17V20M14.5 17V20M7 9.5H4M7 12H4M7 14.5H4M17 9.5H20M17 12H20M17 14.5H20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatQuantity(qty: number | undefined): string {
  return typeof qty === "number" ? `${qty} шт.` : "—";
}

function NoteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M5 6h10M5 10h10M5 14h7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
