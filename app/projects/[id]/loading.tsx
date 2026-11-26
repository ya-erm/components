"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { ProjectDescription } from "@/components/ProjectDescription";
import { useProjectNavigation } from "@/components/ProjectNavigationProvider";
import type { ProjectListEntry } from "@/components/ProjectList";
import { buttonClass } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/Field";

const bar = "rounded bg-[var(--color-surface-2)]";

function EditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="m12.5 3.5 4 4M3.5 16.5l4.2-1 9-9a1.4 1.4 0 0 0 0-2l-1.2-1.2a1.4 1.4 0 0 0-2 0l-9 9-1 4.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhotoStrip({ images }: { images?: string[] }) {
  return (
    <div className="h-32 overflow-x-auto rounded-xl sm:h-36">
      <ul className="flex h-full min-w-0 gap-2 pb-1">
        {images?.map((src, index) => (
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
  );
}

function ProjectComponentsPreview({ project }: { project: ProjectListEntry }) {
  return (
    <section aria-label="Компоненты проекта">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Компоненты проекта</h2>
        <span className={buttonClass("secondary")}>Выбрать компоненты</span>
      </div>
      {project.components.length ? (
        <div className="flex flex-col gap-2">
          {project.components.map((component) => (
            <div key={component.id} className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] py-1 pr-3">
              <span className="flex size-9 shrink-0 items-center justify-center text-[var(--color-muted)]">
                <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden="true">
                  {[5, 10, 15].map((y) => (
                    <g key={y}><circle cx="7" cy={y} r="1.5" /><circle cx="13" cy={y} r="1.5" /></g>
                  ))}
                </svg>
              </span>
              {component.image ? (
                <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-[var(--color-surface-2)]">
                  <Image src={component.image} alt="" fill sizes="40px" className="object-cover" />
                </span>
              ) : null}
              <span className="min-w-0 flex-1 break-words text-sm text-[var(--color-accent)]">{component.name}</span>
              <span className="shrink-0 text-sm tabular-nums">
                {component.unknown ? component.quantity ? `${component.quantity}+` : "—" : component.quantity} шт.
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted)]">Компоненты пока не использованы. Добавьте их кнопкой «Выбрать компоненты».</p>
      )}
      <p className="mt-2 text-xs text-[var(--color-muted)]">&nbsp;</p>
    </section>
  );
}

function ProjectPreview({ project }: { project: ProjectListEntry }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold">
        <span className="min-w-0 break-words">{project.name}</span>
        <EditIcon className="size-5 shrink-0 text-[var(--color-muted)]" />
      </h1>
      <PhotoStrip images={project.images} />
      <section className="flex flex-col gap-3" aria-label="Описание проекта">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-[var(--color-muted)]">Описание</h2>
          <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-[var(--color-accent)]"><EditIcon className="size-4" />Изменить</span>
        </div>
        {project.description ? <ProjectDescription text={project.description} /> : (
          <span className="self-start rounded-lg text-sm text-[var(--color-accent)]">Добавить описание</span>
        )}
      </section>
      <ProjectComponentsPreview project={project} />
    </div>
  );
}

function ProjectSkeleton() {
  return (
    <div className="flex flex-col gap-5 motion-safe:animate-pulse">
      <div className="flex h-8 items-center gap-2"><span className={`h-8 w-2/3 ${bar}`} /><span className={`size-5 shrink-0 ${bar}`} /></div>
      <div className="h-32 sm:h-36"><div className={`aspect-square h-[calc(100%_-_0.25rem)] rounded-xl ${bar}`} /></div>
      <div className="flex flex-col gap-3">
        <div className="flex h-7 items-center justify-between gap-3"><span className={`h-4 w-24 ${bar}`} /><span className={`h-6 w-24 ${bar}`} /></div>
        <div className={`h-4 w-40 ${bar}`} />
      </div>
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className={`h-7 w-40 ${bar}`} /><span className={`h-10 w-44 ${bar}`} /></div>
        {[0, 1].map((index) => (
          <div key={index} className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--color-border)] py-1 pr-3">
            <span className="size-9 shrink-0" /><span className={`size-10 shrink-0 ${bar}`} /><span className={`h-4 w-1/2 ${bar}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProjectLoading() {
  const { id } = useParams<{ id: string }>();
  const { preview } = useProjectNavigation();
  const project = preview?.id === id ? preview : null;
  return (
    <>
      <AppHeader
        title={project?.name || <span aria-hidden="true" className={`mx-auto block h-5 w-32 motion-safe:animate-pulse ${bar}`} />}
        left={<BackLink href="/projects" />}
        right={<span className="px-2 font-medium text-[var(--color-accent)] opacity-40">Готово</span>}
      />
      <div role="status" aria-label="Загрузка проекта" className="mx-auto max-w-xl px-4 py-5">
        <span className="sr-only">Загружаем проект…</span>
        <div aria-hidden="true">{project ? <ProjectPreview project={project} /> : <ProjectSkeleton />}</div>
      </div>
    </>
  );
}
