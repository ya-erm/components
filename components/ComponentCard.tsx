import Image from "next/image";
import Link from "next/link";
import { ComponentDTO } from "@/lib/components-repo";
import { mainImage } from "@/lib/schema";
import { StatusBadge } from "@/components/StatusBadge";

export function ComponentCard({ item }: { item: ComponentDTO }) {
  const img = mainImage(item.data);
  const qty = item.data.quantity;

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
            <StatusBadge status={item.data.status} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{item.data.name}</h3>
        {item.data.type ? (
          <span className="truncate text-xs text-[var(--color-muted)]">{item.data.type}</span>
        ) : null}
        <div className="mt-auto flex items-center justify-between pt-1 text-xs text-[var(--color-muted)]">
          <span>{typeof qty === "number" ? `${qty} шт.` : "—"}</span>
        </div>
      </div>
    </Link>
  );
}
