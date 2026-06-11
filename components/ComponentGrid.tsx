"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { ComponentDTO } from "@/lib/components-repo";
import { COMPONENT_STATUSES, STATUS_LABELS, mainImage } from "@/lib/schema";
import { ComponentCard } from "@/components/ComponentCard";
import { StatusBadge } from "@/components/StatusBadge";
import { ChevronDownIcon, FilterIcon, Input, SearchIcon, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { CenterState, Spinner } from "@/components/ui/states";

type Page = { items: ComponentDTO[]; total: number; page: number; pageSize: number };
type Facet = { value: string; count: number };
type GroupBy = "none" | "type" | "tag";
type ViewMode = "grid" | "compact" | "list";
type CollapsedGroupsByGroup = { type: string[]; tag: string[] };
type CollapsibleGroupBy = Exclude<GroupBy, "none">;

const DEFAULT_GROUP_BY: GroupBy = "type";
const COLLAPSED_GROUPS_COOKIE_PREFIX = "components-collapsed-groups";
const VIEW_MODE_COOKIE_NAME = "components-view-mode";
const EMPTY_COLLAPSED_GROUPS = new Set<string>();
const NO_TYPE = "Без типа";
const NO_TAGS = "Без тегов";

export function ComponentGrid({
  initial,
  initialViewMode,
  initialCollapsedGroups,
}: {
  initial: Page;
  initialViewMode: ViewMode;
  initialCollapsedGroups: CollapsedGroupsByGroup;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Инициализируем фильтры из URL — восстанавливаются при навигации назад.
  const [items, setItems] = useState<ComponentDTO[]>(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(initial.page);

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "");
  const [type, setType] = useState(() => searchParams.get("type") ?? "");
  const [tag, setTag] = useState(() => searchParams.get("tag") ?? "");
  const [groupBy, setGroupBy] = useState<GroupBy>(
    () => parseGroupBy(searchParams.get("groupBy")),
  );
  const [viewMode, setViewModeState] = useState<ViewMode>(initialViewMode);

  const hasUrlFilters = Boolean(
    searchParams.get("q") || searchParams.get("status") || searchParams.get("type") ||
    searchParams.get("tag") || searchParams.get("groupBy"),
  );

  // На мобильном панель фильтров скрыта по умолчанию; открываем если уже есть активные.
  const [filtersOpen, setFiltersOpen] = useState(hasUrlFilters);
  const activeFilters =
    (status ? 1 : 0) + (type ? 1 : 0) + (tag ? 1 : 0) + (groupBy !== DEFAULT_GROUP_BY ? 1 : 0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [types, setTypes] = useState<Facet[]>([]);
  const [tags, setTags] = useState<Facet[]>([]);
  const [collapsedGroupsByGroup, setCollapsedGroupsByGroup] = useState<
    Record<CollapsibleGroupBy, Set<string>>
  >(() => ({
    type: new Set(initialCollapsedGroups.type),
    tag: new Set(initialCollapsedGroups.tag),
  }));

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

  const setViewMode = (next: ViewMode) => {
    setViewModeState(next);
    writeViewModeCookie(next);
  };

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
  // Если URL уже содержит фильтры при монтировании — isFirst=false, чтобы сразу загрузить.
  const isFirst = useRef(!hasUrlFilters);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const t = setTimeout(() => {
      // Обновляем URL с replace (без записи в историю).
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      if (type) params.set("type", type);
      if (tag) params.set("tag", tag);
      if (groupBy !== DEFAULT_GROUP_BY) params.set("groupBy", groupBy);
      const search = params.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
      // Загружаем данные.
      load(groupBy === "none" ? { pageNum: 1 } : { all: true });
    }, 250);
    return () => clearTimeout(t);
  }, [query, status, type, tag, groupBy, load, pathname, router]);

  const hasMore = groupBy === "none" && items.length < total;
  const hasFilters = Boolean(query.trim() || status || type || tag);

  const grouped = groupItems(items, groupBy);
  const collapsedGroups =
    groupBy === "none" ? EMPTY_COLLAPSED_GROUPS : collapsedGroupsByGroup[groupBy];

  const toggleGroup = (key: string) => {
    if (groupBy === "none") return;

    const collapsedGroupBy = groupBy;
    setCollapsedGroupsByGroup((prev) => {
      const next = new Set(prev[collapsedGroupBy]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeCollapsedGroupsCookie(collapsedGroupBy, next);
      return { ...prev, [collapsedGroupBy]: next };
    });
  };

  return (
    <div className="flex flex-col">
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-10 -mx-4 flex flex-col gap-2 bg-[var(--color-bg)]/90 px-4 py-2 backdrop-blur">
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

          <ViewModeSwitch value={viewMode} onChange={setViewMode} />

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
              <option value="type">Группировка по типу</option>
              <option value="tag">Группировка по тегу</option>
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
          <ComponentList items={items} viewMode={viewMode} />
          {hasMore ? (
            <div className="flex justify-center py-2">
              <Button variant="secondary" disabled={loading} onClick={() => load({ append: true, pageNum: page + 1 })}>
                {loading ? <Spinner /> : "Показать ещё"}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {grouped.map((g) => (
            <GroupSection
              key={g.key}
              groupBy={groupBy}
              groupKey={g.key}
              items={g.items}
              viewMode={viewMode}
              collapsed={collapsedGroups.has(g.key)}
              onToggle={() => toggleGroup(g.key)}
            />
          ))}
          {loading ? <CenterState icon={<Spinner />} title="Загрузка…" /> : null}
        </div>
      )}
    </div>
  );
}

function ViewModeSwitch({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}) {
  const options: { value: ViewMode; label: string; icon: (props: { className?: string }) => ReactNode }[] = [
    { value: "grid", label: "Обычная сетка", icon: GridIcon },
    { value: "compact", label: "Компактная сетка", icon: CompactGridIcon },
    { value: "list", label: "Список", icon: ListIcon },
  ];
  const [mobileOpen, setMobileOpen] = useState(false);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex] ?? options[0];
  const CurrentIcon = selected.icon;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        aria-label={`Вид списка: ${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={mobileOpen}
        title={`Вид: ${selected.label}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] sm:hidden"
      >
        <CurrentIcon className="size-5" />
      </button>

      {mobileOpen ? (
        <div
          role="menu"
          aria-label="Выбрать вид списка"
          className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg shadow-black/10 sm:hidden"
        >
          {options.map((option) => {
            const Icon = option.icon;
            const isSelected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setMobileOpen(false);
                }}
                className={clsx(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition",
                  isSelected
                    ? "bg-[var(--color-surface-2)] text-[var(--color-fg)]"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {isSelected ? <CheckIcon className="size-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        className="hidden h-11 shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] sm:flex"
        role="group"
        aria-label="Вид списка"
      >
        {options.map((option) => {
          const Icon = option.icon;
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-label={option.label}
              aria-pressed={isSelected}
              title={option.label}
              className={clsx(
                "flex w-10 items-center justify-center border-r border-[var(--color-border)] transition last:border-r-0",
                isSelected
                  ? "bg-[var(--color-surface-2)] text-[var(--color-fg)]"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]",
              )}
            >
              <Icon className="size-4.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ComponentList({
  items,
  viewMode,
  hideType = false,
}: {
  items: ComponentDTO[];
  viewMode: ViewMode;
  hideType?: boolean;
}) {
  if (viewMode === "list") return <TableList items={items} hideType={hideType} />;
  return <Grid items={items} hideType={hideType} compact={viewMode === "compact"} />;
}

function Grid({
  items,
  hideType = false,
  compact = false,
}: {
  items: ComponentDTO[];
  hideType?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={compact
        ? "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
        : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"}
    >
      {items.map((item) => (
        <ComponentCard key={item.id} item={item} hideType={hideType} variant={compact ? "compact" : "default"} />
      ))}
    </div>
  );
}

function TableList({ items, hideType = false }: { items: ComponentDTO[]; hideType?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="hidden grid-cols-[1fr_8rem_8rem_6rem] gap-3 border-b border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted)] sm:grid">
        <span>Компонент</span>
        <span>{hideType ? "Теги" : "Тип"}</span>
        <span>Статус</span>
        <span className="text-right">Кол-во</span>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {items.map((item) => (
          <TableListRow key={item.id} item={item} hideType={hideType} />
        ))}
      </div>
    </div>
  );
}

function TableListRow({ item, hideType = false }: { item: ComponentDTO; hideType?: boolean }) {
  const img = mainImage(item.data);
  const tags = item.data.tags ?? [];
  const qty = formatQuantity(item.data.quantity);
  const secondary = hideType
    ? tags.slice(0, 2).join(", ") || "Без тегов"
    : item.data.type || "Без типа";

  return (
    <Link
      href={`/components/${item.id}`}
      className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 transition hover:bg-[var(--color-surface-2)] active:opacity-80 sm:grid-cols-[1fr_8rem_8rem_6rem] sm:items-center"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-[var(--color-surface-2)]">
          {img ? (
            <Image
              src={img}
              alt={item.data.name}
              fill
              sizes="44px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg text-[var(--color-muted)]">
              📷
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{item.data.name}</div>
          <div className="truncate text-xs text-[var(--color-muted)] sm:hidden">{secondary}</div>
        </div>
      </div>

      <div className="hidden min-w-0 truncate text-sm text-[var(--color-muted)] sm:block">
        {secondary}
      </div>

      <div className="hidden sm:block">
        <StatusBadge status={item.data.status} />
      </div>

      <div className="flex flex-col items-end justify-center gap-1 sm:block sm:text-right">
        <span className="text-sm tabular-nums">{qty}</span>
        <span className="sm:hidden">
          <StatusBadge status={item.data.status} className="text-[10px]" />
        </span>
      </div>
    </Link>
  );
}

function GroupSection({
  groupBy,
  groupKey,
  items,
  viewMode,
  collapsed,
  onToggle,
}: {
  groupBy: GroupBy;
  groupKey: string;
  items: ComponentDTO[];
  viewMode: ViewMode;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const contentId = groupContentId(groupBy, groupKey);

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        className="-mx-2 flex min-h-9 items-center gap-2 rounded-lg px-2 text-left transition hover:bg-[var(--color-surface-2)] cursor-pointer"
      >
        <ChevronDownIcon
          className={clsx(
            "size-4 shrink-0 text-[var(--color-muted)] transition-transform",
            collapsed ? "-rotate-90" : "rotate-0",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-base font-semibold">{groupKey}</span>
        <span className="shrink-0 text-sm font-normal text-[var(--color-muted)]">{items.length} шт.</span>
      </button>
      {collapsed ? null : (
        <div id={contentId}>
          <ComponentList items={items} hideType={groupBy === "type"} viewMode={viewMode} />
        </div>
      )}
    </section>
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

function parseGroupBy(value: string | null): GroupBy {
  if (value === "none" || value === "type" || value === "tag") return value;
  return DEFAULT_GROUP_BY;
}

function writeViewModeCookie(viewMode: ViewMode) {
  if (typeof window === "undefined") return;
  document.cookie = `${VIEW_MODE_COOKIE_NAME}=${viewMode}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function formatQuantity(qty: number | undefined): string {
  return typeof qty === "number" ? `${qty} шт.` : "—";
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CompactGridIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4 4h3v3H4zM8.5 4h3v3h-3zM13 4h3v3h-3zM4 8.5h3v3H4zM8.5 8.5h3v3h-3zM13 8.5h3v3h-3zM4 13h3v3H4zM8.5 13h3v3h-3zM13 13h3v3h-3z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M5 5h11M5 10h11M5 15h11M3 5h.01M3 10h.01M3 15h.01"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="m4.5 10.5 3.5 3.5 7.5-8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function collapsedGroupsCookieName(groupBy: CollapsibleGroupBy): string {
  return `${COLLAPSED_GROUPS_COOKIE_PREFIX}-${groupBy}`;
}

function writeCollapsedGroupsCookie(groupBy: CollapsibleGroupBy, collapsedGroups: Set<string>) {
  if (typeof window === "undefined") return;

  const value = encodeURIComponent(JSON.stringify(Array.from(collapsedGroups)));
  document.cookie = `${collapsedGroupsCookieName(groupBy)}=${value}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function groupContentId(groupBy: GroupBy, groupKey: string): string {
  return `component-group-${groupBy}-${encodeURIComponent(groupKey)}`;
}
