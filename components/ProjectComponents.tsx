"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ComponentDTO } from "@/lib/components-repo";
import { inventoryTotals, type Project } from "@/lib/schema";
import { getProjectComponentsVersion } from "@/lib/project-components";
import { SortableList } from "@/components/SortableList";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

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
}: {
  initialProject: Project;
  initialItems: ComponentDTO[];
}) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const [selection, setSelection] = useState<Selection[]>([]);
  const [expected, setExpected] = useState("");
  const [query, setQuery] = useState("");
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
    setQuery("");
    setError(null);
    setNotice("");
    editingRef.current = true;
    setEditing(true);
  }

  function closePicker() {
    editingRef.current = false;
    setEditing(false);
    setError(null);
    setQuery("");
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
  const needle = query.trim().toLocaleLowerCase();
  const matching = items.filter((item) =>
    [item.data.name, item.data.type, ...item.data.tags].some((text) =>
      text?.toLocaleLowerCase().includes(needle),
    ),
  );
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
        <form
          onSubmit={save}
          aria-label="Выбор компонентов проекта"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !saving) {
              event.preventDefault();
              closePicker();
            }
          }}
        >
          <fieldset disabled={saving} className="flex min-w-0 flex-col gap-3">
            <p className="text-sm text-[var(--color-muted)]">
              Отметьте используемые компоненты и укажите количество. Пустое
              количество означает «неизвестно». Снятие галочки убирает
              использование только из этого проекта, не удаляя компонент.
            </p>
            <Input
              autoFocus
              aria-label="Найти компонент в каталоге"
              placeholder="Название, тип или тег"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <p className="text-sm" role="status">
              Выбрано: {selection.length} · Найдено: {matching.length}
            </p>
            <div className="max-h-[55vh] overflow-y-auto overscroll-contain rounded-lg border border-[var(--color-border)]">
              {matching.map((item) => {
                const selected = selectionById.get(item.id);
                const stock = inventoryTotals(item.data).find(
                  (total) => total.status === "in_stock",
                )!;
                const used = usedBy(item, project.id);
                return (
                  <div
                    key={item.id}
                    className={`border-b border-[var(--color-border)] p-3 last:border-0 ${selected ? "bg-[var(--color-surface-2)]" : ""}`}
                  >
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-5 shrink-0 accent-[var(--color-accent)]"
                        checked={!!selected}
                        onChange={(event) =>
                          setSelection((current) =>
                            event.target.checked
                              ? [
                                  ...current,
                                  {
                                    id: item.id,
                                    quantity:
                                      used.linked && !used.unknown
                                        ? String(used.quantity)
                                        : "",
                                  },
                                ]
                              : current.filter((entry) => entry.id !== item.id),
                          )
                        }
                      />
                      <Thumbnail item={item} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-medium">
                          {item.data.name}
                        </span>
                        <span className="block text-xs text-[var(--color-muted)]">
                          {item.data.type ? `${item.data.type} · ` : ""}Остаток:{" "}
                          {stock.unknown
                            ? `${stock.quantity}+`
                            : stock.quantity}{" "}
                          шт.
                        </span>
                      </span>
                    </label>
                    {selected ? (
                      <label className="mt-2 flex items-center justify-between gap-3 text-sm">
                        <span>
                          Использовано, шт.
                          {used.unknown && used.quantity > 0 ? (
                            <span className="block text-xs text-[var(--color-muted)]">
                              Сейчас {used.quantity}+; пустое поле сохранит
                              записи
                            </span>
                          ) : null}
                        </span>
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
                          className="w-32 shrink-0"
                        />
                      </label>
                    ) : null}
                  </div>
                );
              })}
              {!matching.length ? (
                <p className="p-3 text-sm text-[var(--color-muted)]">
                  {items.length
                    ? "Компоненты не найдены. Измените поиск."
                    : "Каталог пуст. Сначала создайте компонент в каталоге."}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">
                {saving ? "Сохранение…" : "Сохранить компоненты"}
              </Button>
              <Button type="button" variant="secondary" onClick={closePicker}>
                Отмена
              </Button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          {linked.length > 1 ? (
            <p className="mb-3 text-xs text-[var(--color-muted)]">
              Перетаскивайте за ⠿, чтобы изменить порядок компонентов.
            </p>
          ) : null}
          <SortableList
            items={linked}
            disabled={saving}
            label="Используемые компоненты"
            getLabel={(item) => item.data.name}
            onReorder={reorder}
          >
            {(item, handle) => {
              const used = usedBy(item, project.id);
              return (
                <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] p-2">
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
      {error ? (
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
