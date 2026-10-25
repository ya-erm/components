"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/schema";
import { ProjectCard } from "@/components/ProjectCard";
import { SortableList } from "@/components/SortableList";

export type ProjectListEntry = Project & {
  components: {
    id: string;
    name: string;
    quantity: number;
    unknown: boolean;
  }[];
};

export function ProjectList({ initial }: { initial: ProjectListEntry[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!busy.current) setItems(initial);
  }, [initial]);

  async function reorder(next: ProjectListEntry[]) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    const previous = items;
    setItems(next);
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
      {items.length > 1 ? (
        <p className="text-xs text-[var(--color-muted)]">
          Перетаскивайте за ⠿, чтобы изменить порядок проектов.
        </p>
      ) : null}
      <p role="status" className="text-xs text-[var(--color-muted)]">
        {saving ? "Сохраняем порядок…" : ""}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      ) : null}
      {!items.length ? (
        <p className="text-sm text-[var(--color-muted)]">Проектов пока нет.</p>
      ) : null}
      <SortableList
        items={items}
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
                    href={`/components/${encodeURIComponent(component.id)}`}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 break-words text-[var(--color-accent)]">
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
