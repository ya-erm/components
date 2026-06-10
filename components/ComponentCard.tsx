import Image from "next/image";
import Link from "next/link";
import { ComponentDTO } from "@/lib/components-repo";
import { STATUS_LABELS, mainImage } from "@/lib/schema";
import { StatusBadge } from "@/components/StatusBadge";

export function ComponentCard({ item, hideType = false }: { item: ComponentDTO; hideType?: boolean }) {
  const img = mainImage(item.data);
  const qty = item.data.quantity;
  const hasNote = Boolean(item.data.note?.trim());
  const tags = item.data.tags ?? [];

  return (
    <Link
      href={`/components/${item.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition active:scale-[0.99]"
    >
      <div className="relative aspect-square w-full bg-[var(--color-surface-2)]">
        {img ? (
          <Image
            src={img}
            alt={item.data.name}
            fill
            sizes="(max-width: 768px) 50vw, 240px"
            className="object-cover transition group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-[var(--color-muted)]">
            📷
          </div>
        )}
        {item.data.status ? (
          <div className="absolute left-2 top-2">
            <StatusBadge
              status={item.data.status}
              aria-label={`${STATUS_LABELS[item.data.status]}: ${formatQuantity(qty)}`}
              title={`${STATUS_LABELS[item.data.status]}: ${formatQuantity(qty)}`}
              className="gap-1.5 px-1.5"
            >
              <span>{formatQuantity(qty)}</span>
            </StatusBadge>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-2">
        <div className="flex items-start gap-1.5">
          <h3 className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug">{item.data.name}</h3>
          {hasNote ? (
            <span
              aria-label="Есть заметка"
              title="Есть заметка"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)]"
            >
              <NoteIcon className="size-4" />
            </span>
          ) : null}
        </div>
        {!hideType && item.data.type ? (
          <span className="truncate text-xs text-[var(--color-muted)]">{item.data.type}</span>
        ) : null}
        {tags.length > 0 ? (
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
