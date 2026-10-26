"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ComponentData, Project } from "@/lib/schema";
import { orderProjectComponents } from "@/lib/project-components";
import { COMPONENT_LIST_UPDATE, saveComponentInBackground, type ComponentListUpdate, type ComponentSavePayload } from "@/lib/component-list-state";
import { ProjectCard } from "@/components/ProjectCard";
import { useProjectNavigation } from "@/components/ProjectNavigationProvider";
import { SortableList } from "@/components/SortableList";

export type ProjectListEntry = Project & {
  components: {
    id: string;
    name: string;
    image?: string;
    quantity: number;
    unknown: boolean;
  }[];
};

function withComponentData(projects: ProjectListEntry[], id: string, data: ComponentData) {
  return projects.map((project) => {
    const usages = (data.usages ?? []).filter((usage) => usage.projectId === project.id);
    const components = project.components.filter((component) => component.id !== id);
    if (usages.length) {
      components.push({
        id,
        name: data.name,
        image: data.images[0],
        quantity: usages.reduce((sum, usage) => sum + (usage.quantity ?? 0), 0),
        unknown: usages.some((usage) => usage.quantity === undefined),
      });
    }
    return { ...project, components: orderProjectComponents(components, project.componentOrder) };
  });
}

export function ProjectList({ initial }: { initial: ProjectListEntry[] }) {
  const router = useRouter();
  const { setPreview } = useProjectNavigation();
  const [items, setItems] = useState(initial);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const prefetched = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const [componentOverrides, setComponentOverrides] = useState<Map<string, ComponentData>>(() => new Map());
  const [pendingComponents, setPendingComponents] = useState<Set<string>>(() => new Set());
  const [failedComponentSave, setFailedComponentSave] = useState<{
    id: string;
    message: string;
    payload: ComponentSavePayload;
  } | null>(null);
  useEffect(() => {
    if (!busy.current) setItems(initial);
    prefetched.current.clear();
  }, [initial]);

  useEffect(() => {
    const onComponentUpdate = (event: Event) => {
      const update = (event as CustomEvent<ComponentListUpdate>).detail;
      if (update.type === "saving") {
        setFailedComponentSave(null);
        setPendingComponents((current) => new Set(current).add(update.id));
        setComponentOverrides((current) => new Map(current).set(update.id, update.data));
      } else if (update.type === "saved") {
        setPendingComponents((current) => {
          const next = new Set(current);
          next.delete(update.id);
          return next;
        });
        setComponentOverrides((current) => new Map(current).set(update.id, update.item.data));
      } else if (update.type === "deleted") {
        setItems((current) => current.map((project) => ({
          ...project,
          components: project.components.filter((component) => component.id !== update.id),
        })));
        setComponentOverrides((current) => {
          const next = new Map(current);
          next.delete(update.id);
          return next;
        });
      } else {
        setPendingComponents((current) => {
          const next = new Set(current);
          next.delete(update.id);
          return next;
        });
        setComponentOverrides((current) => {
          const next = new Map(current);
          next.delete(update.id);
          return next;
        });
        setFailedComponentSave(update);
      }
    };
    window.addEventListener(COMPONENT_LIST_UPDATE, onComponentUpdate);
    return () => window.removeEventListener(COMPONENT_LIST_UPDATE, onComponentUpdate);
  }, []);

  const visibleItems = [...componentOverrides].reduce(
    (projects, [id, data]) => withComponentData(projects, id, data),
    items,
  );

  function prefetchProject(id: string) {
    if (prefetched.current.has(id)) return;
    prefetched.current.add(id);
    router.prefetch(`/projects/${encodeURIComponent(id)}`);
  }

  async function reorder(next: ProjectListEntry[]) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    const previous = items;
    setItems(next.map((project) => items.find((item) => item.id === project.id) ?? project));
    try {
      const response = await fetch("/api/projects/order", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: next.map((item) => item.id) }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Не удалось сохранить порядок");
      router.refresh();
    } catch (error) {
      setItems(previous);
      setError(
        error instanceof Error ? error.message : "Не удалось сохранить порядок",
      );
      router.refresh();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      {saving ? (
        <p role="status" className="text-xs text-[var(--color-muted)]">
          Сохраняем порядок…
        </p>
      ) : null}
      {pendingComponents.size ? <p role="status" className="text-xs text-[var(--color-muted)]">Сохраняем компонент…</p> : null}
      {failedComponentSave ? (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-xl border border-red-500/40 p-3 text-sm text-red-600 dark:text-red-400">
          <span>Не удалось сохранить компонент: {failedComponentSave.message}</span>
          <button type="button" className="shrink-0 text-[var(--color-accent)]" onClick={() => saveComponentInBackground(failedComponentSave.id, failedComponentSave.payload)}>Повторить</button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      ) : null}
      {!visibleItems.length ? (
        <p className="text-sm text-[var(--color-muted)]">Проектов пока нет.</p>
      ) : null}
      <SortableList
        items={visibleItems}
        disabled={saving}
        label="Список проектов"
        getLabel={(project) => project.name}
        onReorder={reorder}
      >
        {(project, handle) => (
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="mb-3 flex items-center gap-2">
              <Link
                href={`/projects/${encodeURIComponent(project.id)}`}
                onMouseEnter={() => {
                  setPreview(project);
                  prefetchProject(project.id);
                }}
                onFocus={() => {
                  setPreview(project);
                  prefetchProject(project.id);
                }}
                onClick={() => setPreview(project)}
                className="min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              >
                <ProjectCard project={project} />
              </Link>
              {handle}
            </div>
            <ul className="flex flex-col gap-2">
              {project.components.map((component) => (
                <li key={component.id}>
                  <Link
                    href={`/components/${encodeURIComponent(component.id)}?returnTo=${encodeURIComponent("/projects")}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    {component.image ? (
                      <span className="relative size-9 shrink-0 overflow-hidden rounded-md bg-[var(--color-surface-2)]">
                        <Image src={component.image} alt="" fill sizes="36px" className="object-cover" />
                      </span>
                    ) : (
                      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-2)] font-medium text-[var(--color-muted)]">
                        {component.name.slice(0, 1).toUpperCase() || "·"}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 break-words text-[var(--color-accent)]">
                      {component.name}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {component.unknown
                        ? component.quantity
                          ? `${component.quantity}+`
                          : "—"
                        : component.quantity}{" "}
                      шт.
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {!project.components.length ? (
              <p className="text-sm text-[var(--color-muted)]">
                Компоненты пока не использованы.
              </p>
            ) : null}
          </section>
        )}
      </SortableList>
    </>
  );
}
