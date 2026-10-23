/** Настройки импорта принадлежат аккаунту в конкретном браузере. */
export type ImportPreferences = {
  version: 1;
  ignoredOrders: Record<string, string[]>;
  migratedSources: string[];
};
export type ImportOrderRef = { source: string; id: string };
export const importPreferencesKey = (ownerId: string) => `import-preferences:v1:${ownerId}`;
const sourceKey = (source: string) => source.trim().toLowerCase();

export function readImportPreferences(raw: string | null): ImportPreferences {
  if (!raw) return { version: 1, ignoredOrders: {}, migratedSources: [] };
  const value = JSON.parse(raw) as ImportPreferences;
  if (value.version !== 1 || !value.ignoredOrders || typeof value.ignoredOrders !== "object" || Array.isArray(value.ignoredOrders) ||
      !Array.isArray(value.migratedSources) || value.migratedSources.some((source) => typeof source !== "string") ||
      Object.values(value.ignoredOrders).some((ids) => !Array.isArray(ids) || ids.some((id) => typeof id !== "string")))
    throw new Error("Некорректные настройки импорта в браузере");
  return value;
}

export function isOrderIgnored(preferences: ImportPreferences, source: string, id: string) {
  const key = sourceKey(source);
  return Object.hasOwn(preferences.ignoredOrders, key) && preferences.ignoredOrders[key].includes(id);
}

export function setOrderIgnored(preferences: ImportPreferences, source: string, id: string, ignored: boolean): ImportPreferences {
  const key = sourceKey(source);
  const ids = new Set(Object.hasOwn(preferences.ignoredOrders, key) ? preferences.ignoredOrders[key] : []);
  if (ignored) ids.add(id);
  else ids.delete(id);
  return { ...preferences, ignoredOrders: { ...preferences.ignoredOrders, [key]: [...ids] } };
}

/** Маркер защищает восстановленные пользователем заказы от повторного переноса. */
export function migrateImportPreferences(preferences: ImportPreferences, entries: ImportOrderRef[]): ImportPreferences {
  let next = preferences;
  for (const entry of entries) {
    if (!preferences.migratedSources.includes(sourceKey(entry.source)))
      next = setOrderIgnored(next, entry.source, entry.id, true);
  }
  return { ...next, migratedSources: [...new Set([
    ...preferences.migratedSources, ...entries.map((entry) => sourceKey(entry.source)),
  ])] };
}
