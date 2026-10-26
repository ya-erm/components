import Link from "next/link";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { PlusIcon } from "@/components/ui/Field";

export default function ProjectsLoading() {
  return (
    <>
      <AppHeader
        title="Проекты"
        left={<BackLink href="/components" />}
        right={
          <Link
            href="/projects/new"
            aria-label="Новый проект"
            className="-mr-1 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 font-medium text-[var(--color-accent)]"
          >
            <PlusIcon className="size-5 shrink-0" />
            <span className="hidden sm:inline">Новый проект</span>
          </Link>
        }
      />
      <div
        role="status"
        aria-label="Загрузка проектов"
        className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-5"
      >
        <span className="sr-only">Загружаем проекты…</span>
        <div aria-hidden="true" className="flex flex-col gap-4 motion-safe:animate-pulse">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="mb-3 flex gap-3">
                <div className="size-20 shrink-0 rounded-lg bg-[var(--color-surface-2)]" />
                <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                  <div className="h-5 w-2/3 rounded bg-[var(--color-surface-2)]" />
                  <div className="h-4 w-full rounded bg-[var(--color-surface-2)]" />
                  <div className="h-4 w-1/2 rounded bg-[var(--color-surface-2)]" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-9 shrink-0 rounded-md bg-[var(--color-surface-2)]" />
                <div className="h-4 w-1/2 rounded bg-[var(--color-surface-2)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
