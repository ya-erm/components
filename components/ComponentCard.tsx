import Image from "next/image";
import Link from "next/link";
import type { ComponentDTO } from "@/lib/components-repo";
import { mainImage } from "@/lib/schema";
import { InventorySummary } from "@/components/InventorySummary";

export function ComponentCard({
  item,
  hideType = false,
  variant = "default",
  onSelect,
  selected,
  readOnly = false,
  newTab = false,
}: {
  item: ComponentDTO;
  hideType?: boolean;
  variant?: "default" | "compact";
  onSelect?: () => void;
  selected?: boolean;
  readOnly?: boolean;
  newTab?: boolean;
}) {
  const img = mainImage(item.data);
  const hasNote = Boolean(item.data.note?.trim() || item.data.comments.length);
  const tags = item.data.tags ?? [];
  const compact = variant === "compact";

  const className = compact
    ? "group flex w-full flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-left transition active:scale-[0.99]"
    : "group flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-left transition active:scale-[0.99]";
  const content = (
    <>
      <div className="relative aspect-square w-full bg-[var(--color-surface-2)]">
        {img ? (
          <Image
            src={img}
            alt={item.data.name}
            fill
            sizes={
              compact
                ? "(max-width: 768px) 33vw, 160px"
                : "(max-width: 768px) 50vw, 240px"
            }
            className="object-cover transition group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <NoImageIcon className="size-[50%]" />
          </div>
        )}
        {onSelect && selected !== undefined ? (
          <span
            aria-hidden="true"
            className={`absolute right-2 top-2 flex size-6 items-center justify-center rounded-full border-2 shadow-sm ${selected ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "border-[var(--color-muted)] bg-[var(--color-surface)]"}`}
          >
            {selected ? (
              <svg viewBox="0 0 20 20" className="size-4" fill="none">
                <path
                  d="m4 10 4 4 8-8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </span>
        ) : null}
      </div>

      <div
        className={
          compact ? "flex flex-1 flex-col p-1.5" : "flex flex-1 flex-col p-2"
        }
      >
        <div className="pb-1.5">
          <InventorySummary data={item.data} compact={compact} />
        </div>
        <div
          className={
            compact ? "flex items-start gap-1" : "flex items-start gap-1.5"
          }
        >
          <h3
            className={
              compact
                ? "line-clamp-2 min-w-0 flex-1 text-xs font-medium leading-tight"
                : "line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug"
            }
          >
            {item.data.name}
          </h3>
          {hasNote ? (
            <span
              aria-label="Есть заметка"
              title="Есть заметка"
              className={
                compact
                  ? "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)]"
                  : "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)]"
              }
            >
              <NoteIcon className={compact ? "size-3.5" : "size-4"} />
            </span>
          ) : null}
        </div>
        {!compact && !hideType && item.data.type ? (
          <span className="truncate text-xs text-[var(--color-muted)]">
            {item.data.type}
          </span>
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
    </>
  );
  if (readOnly) return <div className={className}>{content}</div>;
  if (onSelect)
    return (
      <button
        type="button"
        aria-label={`${selected ? "Убрать" : "Выбрать"} ${item.data.name}`}
        aria-pressed={selected}
        className={`${className}${selected ? " ring-2 ring-[var(--color-accent)]" : ""}`}
        onClick={onSelect}
      >
        {content}
      </button>
    );
  return (
    <Link
      href={`/components/${item.id}`}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener noreferrer" : undefined}
      className={className}
    >
      {content}
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
      <rect
        x="7"
        y="7"
        width="10"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M9.5 7V4M12 7V4M14.5 7V4M9.5 17V20M12 17V20M14.5 17V20M7 9.5H4M7 12H4M7 14.5H4M17 9.5H20M17 12H20M17 14.5H20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NoteIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M5 6h10M5 10h10M5 14h7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
