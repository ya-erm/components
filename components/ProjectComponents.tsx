"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ComponentDTO } from "@/lib/components-repo";
import { type Project } from "@/lib/schema";
import { getProjectComponentsVersion } from "@/lib/project-components";
import { SortableList } from "@/components/SortableList";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { ComponentGrid } from "@/components/ComponentGrid";
import { ImportWorkspace } from "@/components/ImportWorkspace";
import { AppHeader } from "@/components/AppHeader";

type Selection = { id: string; quantity: string };

function usedBy(item: ComponentDTO, projectId: string) {
  const usages = (item.data.usages ?? []).filter(
    (usage) => usage.projectId === projectId,
  );
  return {
    linked: usages.length > 0,
    quantity: usages.reduce((sum, usage) => sum + (usage.quantity ?? 0), 0),
    unknown: usages.some((usage) => usage.quantity === undefined),
  };
}

function orderedItems(items: ComponentDTO[], project: Project) {
  const order = new Map(
    (project.componentOrder ?? []).map((id, index) => [id, index]),
  );
  return items
    .filter((item) => usedBy(item, project.id).linked)
    .sort(
      (a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity),
    );
}

export function ProjectComponents({
  initialProject,
  initialItems,
  ownerId,
}: {
  initialProject: Project;
  initialItems: ComponentDTO[];
  ownerId: string;
}) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const [selection, setSelection] = useState<Selection[]>([]);
  const [expected, setExpected] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const linked = orderedItems(items, project);
  const selectionButton = useRef<HTMLButtonElement>(null);
  // Keep an open selection draft intact. Its version will detect concurrent usage edits.
  useEffect(() => {
    if (!busy.current && !editingRef.current) {
      setProject(initialProject);
      setItems(initialItems);
    }
  }, [initialProject, initialItems]);

  function openPicker() {
    setSelection(
      linked.map((item) => {
        const used = usedBy(item, project.id);
        return {
          id: item.id,
          quantity: used.unknown ? "" : String(used.quantity),
        };
      }),
    );
    setExpected(getProjectComponentsVersion(items, project.id));
    setError(null);
    setNotice("");
    editingRef.current = true;
    setEditing(true);
  }

  function closePicker() {
    editingRef.current = false;
    setEditing(false);
    setError(null);
    requestAnimationFrame(() => selectionButton.current?.focus());
    router.refresh();
  }

  async function reorder(next: ComponentDTO[]) {
    if (busy.current) return;
    const previous = project;
    busy.current = true;
    setSaving(true);
    setError(null);
    setNotice("");
    setProject({ ...project, componentOrder: next.map((item) => item.id) });
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/order`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: next.map((item) => item.id) }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Не удалось сохранить порядок");
      setProject(result.project);
      setNotice("Порядок сохранён");
      router.refresh();
    } catch (error) {
      setProject(previous);
      setError(
        error instanceof Error ? error.message : "Не удалось сохранить порядок",
      );
      router.refresh();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const invalid = selection.some(
      ({ quantity }) =>
        quantity.trim() !== "" &&
        (!/^\d+$/.test(quantity) || !Number.isSafeInteger(Number(quantity))),
    );
    if (invalid) {
      setError(
        "Количество должно быть целым неотрицательным числом. Оставьте поле пустым, если оно неизвестно.",
      );
      return;
    }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/components`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expected,
            components: selection.map(({ id, quantity }) => ({
              id,
              ...(quantity.trim() === "" ? {} : { quantity: Number(quantity) }),
            })),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Не удалось сохранить компоненты");
      setProject(result.project);
      setItems(result.components);
      setExpected(result.version);
      closePicker();
      setNotice("Компоненты проекта сохранены");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить компоненты",
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const selectionById = new Map(selection.map((entry) => [entry.id, entry]));
  const gridInitial = useMemo(
    () => ({
      items: [...items].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
      total: items.length,
      page: 1,
      pageSize: 50,
    }),
    [items],
  );
  function toggleComponent(item: ComponentDTO) {
    if (busy.current) return;
    const used = usedBy(item, project.id);
    setSelection((current) =>
      current.some((entry) => entry.id === item.id)
        ? current.filter((entry) => entry.id !== item.id)
        : [
            ...current,
            {
              id: item.id,
              quantity:
                used.linked && !used.unknown ? String(used.quantity) : "",
            },
          ],
    );
  }
  return (
    <section
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4"
      aria-label="Компоненты проекта"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Компоненты проекта</h2>
        <Button
          ref={selectionButton}
          type="button"
          variant="secondary"
          disabled={saving || editing}
          onClick={openPicker}
        >
          Выбрать компоненты
        </Button>
      </div>
      {editing ? (
        <ImportWorkspace
          label="Выбор компонентов проекта"
          onClose={() => {
            if (!busy.current) closePicker();
          }}
        >
          <form
            onSubmit={save}
            aria-label="Выбор компонентов проекта"
            className="flex min-h-dvh flex-col"
          >
            <AppHeader
              title="Компоненты"
              left={
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={closePicker}
                >
                  Отмена
                </Button>
              }
            />
            <fieldset
              disabled={saving}
              className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 pb-6"
            >
              <p className="py-3 text-sm text-[var(--color-muted)]">
                Нажимайте на карточки, чтобы выбрать компоненты для «
                {project.name}». Количество можно задать под выбранной
                карточкой; пустое поле означает «неизвестно».
              </p>
              <ComponentGrid
                ownerId={ownerId}
                initial={gridInitial}
                initialViewMode="grid"
                initialCollapsedGroups={{ type: [], tag: [] }}
                onSelect={toggleComponent}
                selection={{
                  selectedIds: new Set(selectionById.keys()),
                  renderDetails: (item) => {
                    const selected = selectionById.get(item.id);
                    if (!selected) return null;
                    const used = usedBy(item, project.id);
                    return (
                      <label className="flex min-w-0 flex-col gap-1 p-2 text-xs">
                        <span>Использовано, шт.</span>
                        <Input
                          aria-label={`Использовано ${item.data.name}`}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="Неизвестно"
                          value={selected.quantity}
                          onChange={(event) =>
                            setSelection((current) =>
                              current.map((entry) =>
                                entry.id === item.id
                                  ? { ...entry, quantity: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                          className="min-w-0 py-2"
                        />
                        {used.unknown && used.quantity > 0 ? (
                          <span className="text-[var(--color-muted)]">
                            Сейчас {used.quantity}+; пустое поле сохранит записи
                          </span>
                        ) : null}
                      </label>
                    );
                  },
                }}
              />
            </fieldset>
            <div className="sticky bottom-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-bg)]/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
              <div className="mx-auto flex max-w-5xl flex-col gap-2">
                {error ? (
                  <p role="alert" className="text-sm text-red-500">
                    {error}
                  </p>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <p role="status" className="text-sm">
                    Выбрано: {selection.length}
                    <span className="block text-xs text-[var(--color-muted)]">
                      Включая скрытые фильтрами
                    </span>
                  </p>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Сохранение…" : "Сохранить компоненты"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </ImportWorkspace>
      ) : (
        <>
          <SortableList
            items={linked}
            compact
            disabled={saving}
            label="Используемые компоненты"
            getLabel={(item) => item.data.name}
            onReorder={reorder}
          >
            {(item, handle) => {
              const used = usedBy(item, project.id);
              return (
                <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] p-1">
                  {handle}
                  <Thumbnail item={item} />
                  <Link
                    href={`/components/${encodeURIComponent(item.id)}`}
                    className="min-w-0 flex-1 break-words text-sm text-[var(--color-accent)]"
                  >
                    {item.data.name}
                  </Link>
                  <span className="shrink-0 text-sm tabular-nums">
                    {used.unknown
                      ? used.quantity
                        ? `${used.quantity}+`
                        : "—"
                      : used.quantity}{" "}
                    шт.
                  </span>
                </div>
              );
            }}
          </SortableList>
          {!linked.length ? (
            <p className="text-sm text-[var(--color-muted)]">
              Компоненты пока не использованы. Добавьте их кнопкой «Выбрать
              компоненты».
            </p>
          ) : null}
        </>
      )}
      <p role="status" className="mt-2 text-xs text-[var(--color-muted)]">
        {saving ? "Сохранение…" : notice}
      </p>
      {error && !editing ? (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Thumbnail({ item }: { item: ComponentDTO }) {
  return item.data.images[0] ? (
    <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-[var(--color-surface-2)]">
      <Image
        src={item.data.images[0]}
        alt=""
        fill
        sizes="40px"
        className="object-cover"
      />
    </div>
  ) : null;
}
