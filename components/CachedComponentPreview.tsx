import Image from "next/image";
import type { ComponentData } from "@/lib/schema";
import { InventorySummary } from "@/components/InventorySummary";
import { OrderSummaryBadges } from "@/components/OrderSummaryBadges";
import { StatusIcon } from "@/components/StatusIcon";
import { BASE as buttonBase } from "@/components/ui/Button";
import { ChevronDownIcon, ExternalLinkIcon, Field, PlusIcon, ProjectsIcon, controlClass } from "@/components/ui/Field";

const sectionClass = "flex min-h-12 w-full items-center gap-2";

function PreviewValue({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`${controlClass} min-h-11 ${className}`}>{children}</div>;
}

export function CachedComponentPreview({ data }: { data: ComponentData }) {
  const purchases = data.purchases ?? [];
  const usages = data.usages ?? [];
  const projectCount = new Set(usages.map((usage) => usage.projectId).filter(Boolean)).size;
  const used = usages.reduce((sum, usage) => sum + (usage.quantity ?? 0), 0);
  const usedDisplay = usages.every((usage) => usage.quantity !== undefined)
    ? String(used)
    : used > 0 ? `${used}+` : "—";
  const plural = new Intl.PluralRules("ru").select(projectCount);
  const projectCountLabel = `${projectCount} ${plural === "one" ? "проект" : plural === "few" ? "проекта" : "проектов"}`;

  return (
    <div className="flex flex-col gap-5">
      <Field label="Название">
        <PreviewValue className="truncate">{data.name}</PreviewValue>
      </Field>

      <div>
        <p className="mb-1.5 text-sm font-medium text-[var(--color-muted)]">Фотографии: {data.images.length} шт</p>
        <div className="h-32 overflow-x-auto rounded-xl sm:h-36">
          <ul className="flex h-full min-w-0 gap-2 pb-1">
            {data.images.map((src, index) => (
              <li key={`${src}-${index}`} className="relative aspect-square h-full shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <Image src={src} alt="" fill sizes="144px" className="object-cover" />
              </li>
            ))}
            <li className="aspect-square h-full shrink-0">
              <span className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)]">
                <PlusIcon className="size-7" />
              </span>
            </li>
          </ul>
        </div>
      </div>

      <Field label="Тип" hint="Выберите или введите свой">
        <div className="relative">
          <PreviewValue className="pr-9">{data.type || "\u00a0"}</PreviewValue>
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
        </div>
      </Field>

      <Field label="Теги" hint="Enter или запятая — добавить тег">
        <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-2">
          {data.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-surface)] px-2 py-1 text-sm">
              {tag}<span aria-hidden="true" className="text-[var(--color-muted)]">×</span>
            </span>
          ))}
        </div>
      </Field>

      <Field label="Ссылка на магазин">
        <div className="flex gap-2">
          <PreviewValue className="min-w-0 flex-1 truncate">{data.url || <span className="text-[var(--color-muted)]">https://…</span>}</PreviewValue>
          {data.url ? (
            <span className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-[var(--color-muted)]">
              <ExternalLinkIcon className="size-4" />
            </span>
          ) : null}
        </div>
      </Field>

      <div className="flex flex-col gap-6">
        <div className={sectionClass}>
          <StatusIcon status="in_stock" className="!size-5 text-emerald-600" />
          <span className="shrink-0 text-lg font-semibold">Остаток</span>
          <span className="flex min-w-0 flex-1"><InventorySummary data={data} compact /></span>
          <ChevronDownIcon className="ml-auto size-5 shrink-0 text-[var(--color-muted)]" />
        </div>
        <div className={sectionClass}>
          <StatusIcon status="in_transit" className="!size-5 text-amber-600" />
          <span className="shrink-0 text-lg font-semibold">Заказы</span>
          <span className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto whitespace-nowrap">
            <OrderSummaryBadges purchases={purchases} />
          </span>
          <ChevronDownIcon className="ml-auto size-5 shrink-0 text-[var(--color-muted)]" />
        </div>
        <div className={sectionClass}>
          <ProjectsIcon className="size-5 shrink-0 text-blue-600" />
          <span className="shrink-0 text-lg font-semibold">Использование</span>
          <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-muted)]">{projectCountLabel} · {usedDisplay} шт.</span>
          <ChevronDownIcon className="ml-auto size-5 shrink-0 text-[var(--color-muted)]" />
        </div>
      </div>

      <Field label="Заметка">
        <PreviewValue className="min-h-24 whitespace-pre-wrap break-words">{data.note || "\u00a0"}</PreviewValue>
      </Field>

      <section className="flex flex-col gap-3" aria-label="Комментарии к компоненту">
        <h2 className="text-lg font-semibold">Комментарии к компоненту</h2>
        {data.comments.map((comment) => (
          <div key={comment.id} className="rounded-xl border border-[var(--color-border)] p-3">
            <time dateTime={comment.createdAt} className="mb-2 block text-xs text-[var(--color-muted)]">{comment.createdAt.slice(0, 10)}</time>
            <PreviewValue className="min-h-24 whitespace-pre-wrap break-words">{comment.text}</PreviewValue>
          </div>
        ))}
        <div className={`${buttonBase} border border-[var(--color-border)] bg-[var(--color-surface-2)]`}>Добавить комментарий</div>
      </section>

      <div className={`${buttonBase} bg-[var(--color-surface-2)] text-[var(--color-muted)]`}>Сохранить</div>
    </div>
  );
}
