import type { ComponentDTO } from "@/lib/components-repo";

export type ComponentListPage = {
  items: ComponentDTO[];
  total: number;
  page: number;
  pageSize: number;
};

export type ComponentListState = {
  ownerId: string;
  href: string;
  componentPath: string;
  scrollY: number;
  result: ComponentListPage;
  viewMode: "grid" | "compact" | "list";
  filtersOpen: boolean;
  collapsedGroups: { type: string[]; tag: string[] };
};

// Только память текущей вкладки: каталог не попадает в постоянное хранилище.
// Window также сохраняет состояние при пересборке модулей dev-сервером.
type ListWindow = Window & { __componentListState?: ComponentListState };
function savedList() {
  return typeof window === "undefined"
    ? undefined
    : (window as ListWindow).__componentListState;
}

export function saveComponentList(state: ComponentListState) {
  if (typeof window !== "undefined")
    (window as ListWindow).__componentListState = state;
}

export function readComponentList(ownerId: string, href: string) {
  const saved = savedList();
  return saved?.ownerId === ownerId && saved.href === href ? saved : undefined;
}

export function componentReturnTarget(componentPath: string, fallback: string) {
  const saved = savedList();
  return saved?.componentPath === componentPath
    ? { href: saved.href, scroll: false }
    : { href: fallback, scroll: true };
}

export function updateSavedComponent(item: ComponentDTO) {
  const saved = savedList();
  if (!saved || saved.componentPath !== `/components/${item.id}`) return;
  saveComponentList({
    ...saved,
    result: {
      ...saved.result,
      items: saved.result.items.map((value) =>
        value.id === item.id ? item : value,
      ),
    },
  });
}

export function removeSavedComponent(id: string) {
  const saved = savedList();
  if (!saved || saved.componentPath !== `/components/${id}`) return;
  saveComponentList({
    ...saved,
    result: {
      ...saved.result,
      total: Math.max(0, saved.result.total - 1),
      items: saved.result.items.filter((item) => item.id !== id),
    },
  });
}

// При сверке сохраняем порядок уже показанных карточек, чтобы обновлённая
// запись не прыгала в начало списка из-за новой даты updatedAt.
export function reconcileComponentList(
  previous: ComponentDTO[],
  fresh: ComponentListPage,
) {
  const remaining = new Map(fresh.items.map((item) => [item.id, item]));
  const items = previous.flatMap((item) => {
    const updated = remaining.get(item.id);
    remaining.delete(item.id);
    return updated ? [updated] : [];
  });
  return { ...fresh, items: [...items, ...remaining.values()] };
}
