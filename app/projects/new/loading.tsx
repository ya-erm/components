import { AppHeader, BackLink } from "@/components/AppHeader";
import { buttonClass } from "@/components/ui/Button";
import { PlusIcon, controlClass } from "@/components/ui/Field";

export default function NewProjectLoading() {
  return (
    <>
      <AppHeader
        title="Новый проект"
        left={<BackLink href="/projects" />}
        right={<span className="inline-flex min-h-11 items-center rounded-lg px-2 font-medium text-[var(--color-accent)] opacity-40">Готово</span>}
      />
      <div role="status" aria-label="Загрузка формы проекта" className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-5">
        <div className="flex flex-col gap-5">
          <div className={`${controlClass} text-2xl font-semibold text-[var(--color-muted)]`}>Название проекта</div>
          <div className="h-32 overflow-x-auto rounded-xl sm:h-36">
            <ul className="flex h-full min-w-0 gap-2 pb-1">
              <li className="aspect-square h-full shrink-0">
                <span className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)]">
                  <PlusIcon className="size-7" />
                </span>
              </li>
            </ul>
          </div>
          <section aria-label="Описание проекта" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-[var(--color-muted)]">Описание</h2>
              <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-[var(--color-accent)]">
                <EditIcon />Изменить
              </span>
            </div>
            <span className="self-start rounded-lg text-sm text-[var(--color-accent)]">Добавить описание</span>
          </section>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={buttonClass("primary")}>Сохранить</span>
          <span className={buttonClass("secondary")}>Отмена</span>
        </div>
        <section aria-label="Компоненты проекта">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Компоненты проекта</h2>
            <span className={`${buttonClass("secondary")} opacity-50`}>Выбрать компоненты</span>
          </div>
          <p className="text-sm text-[var(--color-muted)]">Сохраните проект, чтобы выбрать компоненты.</p>
        </section>
        <span className="sr-only">Загружаем проект…</span>
      </div>
    </>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-4">
      <path d="m12.5 3.5 4 4M3.5 16.5l4.2-1 9-9a1.4 1.4 0 0 0 0-2l-1.2-1.2a1.4 1.4 0 0 0-2 0l-9 9-1 4.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
