"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { ProjectDescription } from "@/components/ProjectDescription";
import { useProjectNavigation } from "@/components/ProjectNavigationProvider";
import type { ProjectListEntry } from "@/components/ProjectList";

const bar = "rounded bg-[var(--color-surface-2)]";

function ProjectPreview({ project }: { project: ProjectListEntry }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="break-words text-2xl font-semibold">{project.name}</h1>
      {project.images?.length ? (
        <div className="flex h-32 gap-2 overflow-x-auto sm:h-36">
          {project.images.map((src, index) => (
            <div key={`${src}-${index}`} className="relative aspect-square h-full shrink-0 overflow-hidden rounded-xl bg-[var(--color-surface-2)]">
              <Image src={src} alt="" fill sizes="144px" className="object-cover" />
            </div>
          ))}
        </div>
      ) : null}
      {project.description ? (
        <section className="flex flex-col gap-3" aria-label="Описание проекта">
          <h2 className="text-sm font-medium text-[var(--color-muted)]">Описание</h2>
          <ProjectDescription text={project.description} />
        </section>
      ) : null}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4" aria-label="Компоненты проекта">
        <h2 className="mb-3 text-lg font-semibold">Компоненты проекта</h2>
        {project.components.length ? (
          <div className="flex flex-col gap-2">
            {project.components.map((component) => (
              <div key={component.id} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] p-1">
                {component.image ? (
                  <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-[var(--color-surface-2)]">
                    <Image src={component.image} alt="" fill sizes="40px" className="object-cover" />
                  </span>
                ) : (
                  <span className="size-10 shrink-0 rounded-lg bg-[var(--color-surface-2)]" />
                )}
                <span className="min-w-0 flex-1 break-words text-sm text-[var(--color-accent)]">{component.name}</span>
                <span className="shrink-0 text-sm tabular-nums">
                  {component.unknown
                    ? component.quantity ? `${component.quantity}+` : "—"
                    : component.quantity} шт.
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">Компоненты пока не использованы.</p>
        )}
      </section>
    </div>
  );
}

function ProjectSkeleton() {
  return (
    <div className="flex flex-col gap-5 motion-safe:animate-pulse">
      <div className={`h-8 w-2/3 ${bar}`} />
      <div className="flex h-32 gap-2 overflow-hidden sm:h-36">
        {[0, 1, 2].map((index) => (
          <div key={index} className={`aspect-square h-full shrink-0 rounded-xl ${bar}`} />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <div className={`h-4 w-24 ${bar}`} />
        <div className={`h-4 w-full ${bar}`} />
        <div className={`h-4 w-3/4 ${bar}`} />
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className={`h-6 w-40 ${bar}`} />
          <div className={`h-9 w-28 ${bar}`} />
        </div>
        {[0, 1].map((index) => (
          <div key={index} className="flex items-center gap-3 border-t border-[var(--color-border)] py-2">
            <div className={`size-10 shrink-0 rounded-lg ${bar}`} />
            <div className={`h-4 w-1/2 ${bar}`} />
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
        <div aria-hidden="true">
          {project ? <ProjectPreview project={project} /> : <ProjectSkeleton />}
        </div>
      </div>
    </>
  );
}
