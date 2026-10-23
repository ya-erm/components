"use client";

import type { AliPreview } from "@/lib/aliexpress";
import { ComponentCard } from "@/components/ComponentCard";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/states";

export function AliImportPreview({
  preview,
  busy,
  onBack,
  onApply,
}: {
  preview: AliPreview;
  busy: boolean;
  onBack: () => void;
  onApply: () => void;
}) {
  const unchanged = preview.changes.filter(
    (change) => change.action === "Без изменений",
  );
  const changed = preview.changes.filter(
    (change) => change.action !== "Без изменений",
  );
  return (
    <section aria-label="Предпросмотр импорта" className="flex flex-col gap-5">
      <h2 className="text-xl font-semibold">Проверьте изменения</h2>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Новых компонентов", value: preview.created },
          { label: "Обновлений", value: preview.updated },
          { label: "Без изменений", value: preview.unchanged },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl bg-[var(--color-surface-2)] p-3"
          >
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-xs text-[var(--color-muted)]">{label}</p>
          </div>
        ))}
      </div>
      {changed.map((change) => (
        <article
          key={change.rowId}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <h3 className="mb-3 font-semibold text-[var(--color-accent)]">
            {change.action}
          </h3>
          <p className="mb-3 text-xs text-[var(--color-muted)]">
            Заказ №{change.orderNumber}
          </p>
          <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-start gap-4 sm:grid-cols-[12rem_1fr]">
            <ComponentCard item={change.after} readOnly />
            <div className="min-w-0">
              <dl className="divide-y divide-[var(--color-border)]">
                {change.fields.map((field) => (
                  <div key={field.label} className="py-3 first:pt-0">
                    <dt className="text-xs text-[var(--color-muted)]">
                      {field.label}
                    </dt>
                    <dd className="mt-1 flex flex-wrap items-center gap-2 break-all text-sm">
                      <span className="text-[var(--color-muted)]">
                        {field.before}
                      </span>
                      <span aria-label="станет">→</span>
                      <strong className="rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">
                        {field.after}
                      </strong>
                    </dd>
                  </div>
                ))}
              </dl>
              <details className="mt-3 text-xs text-[var(--color-muted)]">
                <summary className="cursor-pointer py-2">
                  Доставка и подробности
                </summary>
                <ul className="space-y-2 break-words">
                  {change.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </details>
            </div>
          </div>
        </article>
      ))}
      {unchanged.length ? (
        <details
          open={changed.length === 0}
          className="rounded-2xl border border-[var(--color-border)] p-4"
        >
          <summary className="cursor-pointer text-sm">
            Уже в каталоге — {unchanged.length}, изменений нет
          </summary>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {unchanged.map((change) => (
              <ComponentCard key={change.rowId} item={change.after} readOnly />
            ))}
          </div>
        </details>
      ) : null}
      {preview.warnings.length ? (
        <details className="rounded-xl bg-amber-500/10 p-3 text-sm">
          <summary className="cursor-pointer">
            Обратите внимание: {preview.warnings.length}
          </summary>
          <ul className="mt-2 space-y-2">
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onBack}
        >
          Назад к выбору
        </Button>
        <Button type="button" disabled={busy} onClick={onApply}>
          {busy ? <Spinner /> : null}
          {changed.length ? "Сохранить в каталог" : "Завершить"}
        </Button>
      </div>
    </section>
  );
}
