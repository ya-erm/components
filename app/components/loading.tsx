import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { GearIcon, PlusIcon } from "@/components/ui/Field";
import { ProjectsLink } from "@/components/ProjectsNavigation";

const bar = "rounded bg-[var(--color-surface-2)]";

export default function ComponentsLoading() {
  return (
    <>
      <AppHeader
        title="Компоненты"
        left={
          <div className="flex items-center gap-1">
            <Link href="/settings" aria-label="Настройки" className="-ml-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[var(--color-accent)]">
              <GearIcon className="size-5 shrink-0" />
              <span className="hidden sm:inline">Настройки</span>
            </Link>
            <ProjectsLink />
          </div>
        }
        right={
          <Link href="/components/new" aria-label="Добавить компонент" className="-mr-1 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 font-medium text-[var(--color-accent)]">
            <PlusIcon className="size-5 shrink-0" />
            <span className="hidden sm:inline">Добавить</span>
          </Link>
        }
      />
      <div role="status" aria-label="Загрузка компонентов" className="mx-auto max-w-5xl px-4 pb-5">
        <span className="sr-only">Загружаем компоненты…</span>
        <div aria-hidden="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
          <div className="flex gap-2 py-2">
            <div className={`h-11 min-w-0 flex-1 rounded-xl ${bar}`} />
            <div className={`size-11 shrink-0 rounded-xl ${bar}`} />
          </div>
          <div className={`h-4 w-24 ${bar}`} />
          <div className={`h-5 w-32 ${bar}`} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div key={index} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className={`aspect-square w-full ${bar}`} />
                <div className="flex flex-col gap-2 p-3">
                  <div className={`h-4 w-4/5 ${bar}`} />
                  <div className={`h-3 w-1/2 ${bar}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
