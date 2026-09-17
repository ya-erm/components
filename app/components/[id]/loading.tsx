import type { ReactNode } from "react";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { controlClass } from "@/components/ui/Field";
import { BASE as buttonBase } from "@/components/ui/Button";

// Скелетон повторяет разметку ComponentForm 1:1 (те же классы полей и
// кнопок), чтобы при появлении реальных данных не было layout shift —
// но вместо настоящих input/select/textarea/button рисует пульсирующие
// блоки, а не интерактивные (нерабочие) элементы формы.

function LabelBar({ className }: { className: string }) {
  return <span className={`inline-block h-4 animate-pulse rounded bg-[var(--color-surface-2)] ${className}`} />;
}

// Оборачивает LabelBar так, чтобы строка занимала ровно ту же высоту (20px),
// что и настоящий текстовый лейбл (text-sm, line-height 1.25rem) — иначе
// более компактный бар «сплющивает» строку и всё, что ниже, съезжает вверх.
function LabelRow({ className }: { className: string }) {
  return (
    <span className="mb-1.5 flex h-5 items-center">
      <LabelBar className={className} />
    </span>
  );
}

// Заголовок в шапке: строка — h-6 (line-height text-base), сам бар внутри
// ниже и по центру, как у строчных букв — иначе бар из inline-block
// прижимается к baseline и «уезжает» к верху строки, а не на уровень текста.
function TitleBar() {
  return (
    <span className="mx-auto flex h-6 w-40 items-center justify-center">
      <span className="h-5 w-full animate-pulse rounded bg-[var(--color-surface-2)]" />
    </span>
  );
}

// borderColor задаём инлайн-стилем: controlClass уже содержит свой
// border-[var(--color-border)], а порядок Tailwind-утилит одного свойства
// в className не гарантирует перекрытие — инлайн-стиль побеждает всегда.
const noBorder = { borderColor: "var(--color-surface-2)" };

function ControlBar({ className = "" }: { className?: string }) {
  return (
    <div className={`${controlClass} animate-pulse ${className}`} style={noBorder}>
      &nbsp;
    </div>
  );
}

function FieldSkeleton({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <LabelRow className={label} />
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
        title={<TitleBar />}
        left={<BackLink href="/components" />}
        right={<LabelBar className="h-4 w-12" />}
      />

      <div className="mx-auto max-w-xl px-4 py-5" role="status" aria-label="Загрузка компонента">
        <div aria-hidden="true" className="flex flex-col gap-5">
          <FieldSkeleton label="w-20">
            <ControlBar />
          </FieldSkeleton>

          <div>
            <LabelRow className="w-24" />
            <div className="h-32 overflow-x-auto rounded-xl sm:h-36">
              <ul className="flex h-full min-w-0 gap-2 pb-1">
                {[0, 1, 2].map((i) => (
                  <li
                    key={i}
                    className="relative aspect-square h-full shrink-0 animate-pulse overflow-hidden rounded-xl border bg-[var(--color-surface-2)]"
                    style={noBorder}
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
            <div className={`${controlClass} min-h-24 animate-pulse resize-y`} style={noBorder}>
              &nbsp;
            </div>
          </FieldSkeleton>

          <div className={`${buttonBase} w-full animate-pulse bg-[var(--color-surface-2)]`}>&nbsp;</div>
        </div>

        <div aria-hidden="true" className="mt-5">
          <div
            className={`${buttonBase} w-full animate-pulse border bg-[var(--color-surface-2)]`}
            style={noBorder}
          >
            &nbsp;
          </div>
        </div>
        <span className="sr-only">Загрузка компонента…</span>
      </div>
    </>
  );
}
