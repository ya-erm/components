import type { ComponentData } from "./schema";

const compareId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

type Item = { id: string; data: Pick<ComponentData, "usages"> };

/** A deterministic snapshot of only this project's usage links, not unrelated fields. */
export function getProjectComponentsVersion(
  items: Item[],
  projectId: string,
): string {
  return JSON.stringify(
    items
      .flatMap((item) => {
        const usages = (item.data.usages ?? []).filter(
          (usage) => usage.projectId === projectId,
        );
        return usages.length
          ? [
              {
                id: item.id,
                usages: usages
                  .map(({ id, quantity }) => ({ id, quantity }))
                  .sort(compareId),
              },
            ]
          : [];
      })
      .sort(compareId),
  );
}

export function orderProjectComponents<T extends { id: string }>(
  items: T[],
  order?: string[],
): T[] {
  const positions = new Map((order ?? []).map((id, index) => [id, index]));
  return [...items].sort(
    (a, b) =>
      (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity),
  );
}
