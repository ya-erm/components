import type { AliRow } from "./aliexpress";

export const ALI_KIND_LABELS = {
  new: "Новый",
  changed: "Есть изменения",
  unchanged: "Без изменений",
  review: "Нужно уточнить",
};
export type AliKindFilter = keyof typeof ALI_KIND_LABELS | "hidden";

/** Поддерживает также одиночный фильтр из прежних черновиков. */
export function parseAliKinds(value: unknown): AliKindFilter[] {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.filter((item): item is AliKindFilter =>
    typeof item === "string" &&
    (item === "hidden" || Object.hasOwn(ALI_KIND_LABELS, item)),
  ))];
}

export function matchesAliKinds(
  row: Pick<AliRow, "kind" | "ignored">,
  kinds: AliKindFilter[],
) {
  if (!kinds.length) return !row.ignored;
  return kinds.includes(row.ignored ? "hidden" : row.kind);
}
