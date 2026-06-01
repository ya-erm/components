import { randomUUID } from "crypto";
import { getJson, putJson } from "@/lib/s3";
import { ComponentData } from "@/lib/schema";

export const PAGE_SIZE = 50;

export type ComponentDTO = {
  id: string;
  data: ComponentData;
  createdAt: string;
  updatedAt: string;
};

type StoredItem = {
  id: string;
  data: ComponentData;
  createdAt: string;
  updatedAt: string;
};

function catalogKey(ownerId: string) {
  return `users/${ownerId}/catalog.json`;
}

async function readCatalog(ownerId: string): Promise<StoredItem[]> {
  return (await getJson<StoredItem[]>(catalogKey(ownerId))) ?? [];
}

async function writeCatalog(ownerId: string, items: StoredItem[]): Promise<void> {
  await putJson(catalogKey(ownerId), items);
}

function toDTO(item: StoredItem): ComponentDTO {
  return item;
}

function matchesQuery(item: StoredItem, q: string): boolean {
  const lower = q.toLowerCase();
  const d = item.data;
  if (d.name?.toLowerCase().includes(lower)) return true;
  if (d.note?.toLowerCase().includes(lower)) return true;
  if (d.type?.toLowerCase().includes(lower)) return true;
  if (d.url?.toLowerCase().includes(lower)) return true;
  if (d.tags?.some((t) => t.toLowerCase().includes(lower))) return true;
  return false;
}

export async function listComponents(params: {
  ownerId: string;
  query?: string;
  page?: number;
  status?: string;
  type?: string;
  tag?: string;
  all?: boolean;
}): Promise<{ items: ComponentDTO[]; total: number; page: number; pageSize: number }> {
  const catalog = await readCatalog(params.ownerId);

  const q = params.query?.trim();
  const status = params.status?.trim();
  const type = params.type?.trim();
  const tag = params.tag?.trim();

  let filtered = catalog;
  if (q) filtered = filtered.filter((i) => matchesQuery(i, q));
  if (status) filtered = filtered.filter((i) => i.data.status === status);
  if (type) filtered = filtered.filter((i) => i.data.type === type);
  if (tag) filtered = filtered.filter((i) => i.data.tags?.includes(tag));

  // Сортируем по убыванию даты обновления (как было в SQL).
  filtered = [...filtered].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  const total = filtered.length;
  const page = Math.max(1, params.page ?? 1);
  const items = params.all ? filtered : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return { items: items.map(toDTO), total, page, pageSize: PAGE_SIZE };
}

export type Facet = { value: string; count: number };

export async function getFacets(ownerId: string): Promise<{ types: Facet[]; tags: Facet[] }> {
  const catalog = await readCatalog(ownerId);

  const typeMap = new Map<string, number>();
  const tagMap = new Map<string, number>();

  for (const item of catalog) {
    const t = item.data.type?.trim();
    if (t) typeMap.set(t, (typeMap.get(t) ?? 0) + 1);
    for (const tag of item.data.tags ?? []) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
  }

  const toFacets = (map: Map<string, number>): Facet[] =>
    Array.from(map.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "ru"));

  return { types: toFacets(typeMap), tags: toFacets(tagMap) };
}

export async function getComponent(ownerId: string, id: string): Promise<ComponentDTO | null> {
  const catalog = await readCatalog(ownerId);
  const item = catalog.find((i) => i.id === id);
  return item ? toDTO(item) : null;
}

export async function createComponent(ownerId: string, data: ComponentData): Promise<ComponentDTO> {
  const catalog = await readCatalog(ownerId);
  const now = new Date().toISOString();
  const item: StoredItem = { id: randomUUID(), data, createdAt: now, updatedAt: now };
  catalog.push(item);
  await writeCatalog(ownerId, catalog);
  return toDTO(item);
}

export async function updateComponent(
  ownerId: string,
  id: string,
  data: ComponentData,
): Promise<ComponentDTO | null> {
  const catalog = await readCatalog(ownerId);
  const idx = catalog.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  catalog[idx] = { ...catalog[idx], data, updatedAt: new Date().toISOString() };
  await writeCatalog(ownerId, catalog);
  return toDTO(catalog[idx]);
}

export async function deleteComponent(ownerId: string, id: string): Promise<boolean> {
  const catalog = await readCatalog(ownerId);
  const next = catalog.filter((i) => i.id !== id);
  if (next.length === catalog.length) return false;
  await writeCatalog(ownerId, next);
  return true;
}

export async function importComponents(
  ownerId: string,
  items: { id?: string; data: ComponentData }[],
): Promise<{ created: number; updated: number }> {
  const catalog = await readCatalog(ownerId);
  const ownIds = new Set(catalog.map((i) => i.id));
  const now = new Date().toISOString();

  let created = 0;
  let updated = 0;

  for (const item of items) {
    if (item.id && ownIds.has(item.id)) {
      const idx = catalog.findIndex((i) => i.id === item.id);
      if (idx !== -1) {
        catalog[idx] = { ...catalog[idx], data: item.data, updatedAt: now };
        updated++;
      }
    } else {
      catalog.push({ id: randomUUID(), data: item.data, createdAt: now, updatedAt: now });
      created++;
    }
  }

  await writeCatalog(ownerId, catalog);
  return { created, updated };
}
