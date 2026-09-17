import type { ReactNode } from "react";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { controlClass } from "@/components/ui/Field";
import { BASE as buttonBase } from "@/components/ui/Button";

// Скелетон повторяет разметку ComponentForm 1:1 (те же классы полей и
// кнопок), чтобы при появлении реальных данных не было layout shift —
// но вместо настоящих input/select/textarea/button рисует пульсирующие
// блоки, а не интерактивные (нерабочие) элементы формы.

function LabelBar({ className }: { className: string }) {
  return <span className={`inline-block h-3.5 animate-pulse rounded bg-[var(--color-surface-2)] ${className}`} />;
}

function ControlBar({ className = "" }: { className?: string }) {
  return <div className={`${controlClass} animate-pulse ${className}`}>&nbsp;</div>;
}

function FieldSkeleton({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block">
        <LabelBar className={label} />
      </span>
      {children}
      {hint ? (
        <p aria-hidden="true" className="mt-1.5 text-xs text-transparent select-none">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default function Loading() {
  return (
    <>
      <AppHeader
        title=""
        left={<BackLink href="/components" />}
        right={<LabelBar className="h-4 w-12" />}
      />

      <div className="mx-auto max-w-xl px-4 py-5" role="status" aria-label="Загрузка компонента">
        <div aria-hidden="true" className="flex flex-col gap-5">
          <FieldSkeleton label="w-20">
            <ControlBar />
          </FieldSkeleton>

          <div>
            <span className="mb-1.5 block">
              <LabelBar className="w-24" />
            </span>
            <div className="h-32 overflow-x-auto rounded-xl sm:h-36">
              <ul className="flex h-full min-w-0 gap-2 pb-1">
                {[0, 1, 2].map((i) => (
                  <li
                    key={i}
                    className="relative aspect-square h-full shrink-0 animate-pulse overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]"
                  />
                ))}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FieldSkeleton label="w-10" hint="Выберите или введите свой">
              <ControlBar />
            </FieldSkeleton>
            <FieldSkeleton label="w-14">
              <ControlBar />
            </FieldSkeleton>
          </div>

          <FieldSkeleton label="w-12" hint="Enter или запятая — добавить тег">
            <ControlBar />
          </FieldSkeleton>

          <div className="grid grid-cols-[1fr_3fr] gap-4">
            <FieldSkeleton label="w-20">
              <ControlBar />
            </FieldSkeleton>
            <FieldSkeleton label="w-28">
              <ControlBar />
            </FieldSkeleton>
          </div>

          <FieldSkeleton label="w-16">
            <div className={`${controlClass} min-h-24 animate-pulse resize-y`}>&nbsp;</div>
          </FieldSkeleton>

          <div className={`${buttonBase} w-full animate-pulse bg-[var(--color-surface-2)]`}>&nbsp;</div>
        </div>

        <div aria-hidden="true" className="mt-5">
          <div className={`${buttonBase} w-full animate-pulse border border-[var(--color-border)] bg-[var(--color-surface-2)]`}>
            &nbsp;
          </div>
        </div>
        <span className="sr-only">Загрузка компонента…</span>
      </div>
    </>
  );
}
