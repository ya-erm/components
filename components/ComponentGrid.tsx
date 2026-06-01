"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { ComponentDTO } from "@/lib/components-repo";
import { COMPONENT_STATUSES, STATUS_LABELS } from "@/lib/schema";
import { ComponentCard } from "@/components/ComponentCard";
import { FilterIcon, Input, SearchIcon, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { CenterState, Spinner } from "@/components/ui/states";

type Page = { items: ComponentDTO[]; total: number; page: number; pageSize: number };
type Facet = { value: string; count: number };
type GroupBy = "none" | "type" | "tag";

const NO_TYPE = "Без типа";
const NO_TAGS = "Без тегов";

export function ComponentGrid({ initial }: { initial: Page }) {
  const [items, setItems] = useState<ComponentDTO[]>(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(initial.page);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [tag, setTag] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  // На мобильном панель фильтров скрыта по умолчанию (на десктопе видна всегда).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters =
    (status ? 1 : 0) + (type ? 1 : 0) + (tag ? 1 : 0) + (groupBy !== "none" ? 1 : 0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [types, setTypes] = useState<Facet[]>([]);
  const [tags, setTags] = useState<Facet[]>([]);

  // Фасеты для выпадающих списков (типы и теги каталога).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/components/facets")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { types: Facet[]; tags: Facet[] } | null) => {
        if (cancelled || !data) return;
        setTypes(data.types);
        setTags(data.tags);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const reqId = useRef(0);

  const buildParams = useCallback(
    (extra: Record<string, string>) => {
      const p = new URLSearchParams();
      if (query.trim()) p.set("q", query.trim());
      if (status) p.set("status", status);
      if (type) p.set("type", type);
      if (tag) p.set("tag", tag);
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
      return p;
    },
    [query, status, type, tag],
  );

  const load = useCallback(
    async (opts: { append?: boolean; pageNum?: number; all?: boolean }) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const params = opts.all
          ? buildParams({ all: "1" })
          : buildParams({ page: String(opts.pageNum ?? 1) });
        const res = await fetch(`/api/components?${params}`);
        if (!res.ok) throw new Error();
        const data: Page = await res.json();
        if (id !== reqId.current) return;
        setTotal(data.total);
        setPage(data.page);
        setItems((prev) => (opts.append ? [...prev, ...data.items] : data.items));
      } catch {
        if (id === reqId.current) setError("Не удалось загрузить компоненты");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [buildParams],
  );

  // Перезагрузка при изменении поиска/фильтров/режима группировки (с дебаунсом).
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const t = setTimeout(() => {
      load(groupBy === "none" ? { pageNum: 1 } : { all: true });
    }, 250);
    return () => clearTimeout(t);
  }, [query, status, type, tag, groupBy, load]);

  const hasMore = groupBy === "none" && items.length < total;
  const hasFilters = Boolean(query.trim() || status || type || tag);

  const grouped = groupItems(items, groupBy);

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-14 z-10 -mx-4 flex flex-col gap-2 bg-[var(--color-bg)]/90 px-4 py-2 backdrop-blur">
        <div className="flex items-stretch gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
            <Input
              type="search"
              inputMode="search"
              placeholder="Поиск"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Поиск по компонентам"
              className="pl-10"
            />
          </div>

          {/* Переключатель панели фильтров — только на мобильном */}
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-label="Фильтры"
            aria-expanded={filtersOpen}
            className={clsx(
              "relative flex w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] transition sm:hidden",
              filtersOpen
                ? "bg-[var(--color-surface-2)] text-[var(--color-fg)]"
                : "text-[var(--color-muted)]",
            )}
          >
            <FilterIcon className="size-5" />
            {activeFilters > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-[var(--color-accent)] ring-2 ring-[var(--color-bg)]" />
            ) : null}
          </button>
        </div>

        <div className={clsx("flex-wrap gap-2 sm:flex", filtersOpen ? "flex" : "hidden")}>
          <div className="min-w-[47%] flex-1 sm:min-w-32">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Фильтр по статусу"
              className="py-2 text-sm"
            >
              <option value="">Все статусы</option>
              {COMPONENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-[47%] flex-1 sm:min-w-32">
            <Select
              value={type}
              onChange={(e) => setType(e.target.value)}
              aria-label="Фильтр по типу"
              className="py-2 text-sm"
            >
              <option value="">Все типы</option>
              {types.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.value} ({t.count})
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-[47%] flex-1 sm:min-w-32">
            <Select
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              aria-label="Фильтр по тегу"
              className="py-2 text-sm"
            >
              <option value="">Все теги</option>
              {tags.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.value} ({t.count})
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-[47%] flex-1 sm:min-w-32">
            <Select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              aria-label="Группировать"
              className="py-2 text-sm"
            >
              <option value="none">Без группировки</option>
              <option value="type">Группа: тип</option>
              <option value="tag">Группа: тег</option>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-[var(--color-muted)]">
        <span>{hasFilters ? `Найдено: ${total}` : `Всего: ${total}`}</span>
        {hasFilters ? (
          <button
            onClick={() => {
              setQuery("");
              setStatus("");
              setType("");
              setTag("");
            }}
            className="hover:text-[var(--color-fg)]"
          >
            Сбросить фильтры
          </button>
        ) : null}
      </div>

      {error ? (
        <CenterState
          icon="⚠️"
          title="Ошибка"
          description={error}
          action={
            <Button variant="secondary" onClick={() => load(groupBy === "none" ? { pageNum: 1 } : { all: true })}>
              Повторить
            </Button>
          }
        />
      ) : items.length === 0 ? (
        loading ? (
          <CenterState icon={<Spinner />} title="Загрузка…" />
        ) : hasFilters ? (
          <CenterState icon="🔍" title="Ничего не найдено" description="Измените запрос или фильтры." />
        ) : (
          <CenterState icon="📦" title="Пока пусто" description="Добавьте первый компонент." />
        )
      ) : groupBy === "none" ? (
        <>
          <Grid items={items} />
          {hasMore ? (
            <div className="flex justify-center py-2">
              <Button variant="secondary" disabled={loading} onClick={() => load({ append: true, pageNum: page + 1 })}>
                {loading ? <Spinner /> : "Показать ещё"}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map((g) => (
            <section key={g.key} className="flex flex-col gap-3">
              <h2 className="flex items-baseline gap-2 text-sm font-semibold">
                {g.key}
                <span className="text-xs font-normal text-[var(--color-muted)]">{g.items.length}</span>
              </h2>
              <Grid items={g.items} />
            </section>
          ))}
          {loading ? <CenterState icon={<Spinner />} title="Загрузка…" /> : null}
        </div>
      )}
    </div>
  );
}

function Grid({ items }: { items: ComponentDTO[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <ComponentCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function groupItems(
  items: ComponentDTO[],
  groupBy: GroupBy,
): { key: string; items: ComponentDTO[] }[] {
  if (groupBy === "none") return [];

  const map = new Map<string, ComponentDTO[]>();
  const push = (key: string, item: ComponentDTO) => {
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  };

  for (const item of items) {
    if (groupBy === "type") {
      push(item.data.type?.trim() || NO_TYPE, item);
    } else {
      const itemTags = item.data.tags ?? [];
      if (itemTags.length === 0) push(NO_TAGS, item);
      else for (const t of itemTags) push(t, item);
    }
  }

  const placeholder = groupBy === "type" ? NO_TYPE : NO_TAGS;
  return Array.from(map.entries())
    .map(([key, groupedItems]) => ({ key, items: groupedItems }))
    .sort((a, b) => {
      // плейсхолдер ("Без …") — в конец; остальные по убыванию размера, затем по алфавиту
      if (a.key === placeholder) return 1;
      if (b.key === placeholder) return -1;
      if (b.items.length !== a.items.length) return b.items.length - a.items.length;
      return a.key.localeCompare(b.key, "ru");
    });
}
