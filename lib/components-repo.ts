import { randomUUID } from "crypto";
import {
  getJson,
  putJson,
  getJsonVersioned,
  putJsonConditional,
} from "@/lib/s3";
import {
  AliConflictError,
  aliExportSchema,
  type AliSelection,
  planAliImport,
} from "./aliexpress";
import type { z } from "zod";
import {
  type ComponentData,
  type Logistics,
  type Project,
  hasInventoryStatus,
} from "@/lib/schema";
import {
  type Catalog,
  parseCatalog,
  mergeLogistics,
  validateCatalog,
  normalizeCatalog,
  CatalogValidationError,
} from "@/lib/catalog";

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

export async function readCatalog(ownerId: string): Promise<Catalog> {
  return parseCatalog(await getJson<unknown>(catalogKey(ownerId)));
}

export async function applyAliImport(
  ownerId: string,
  data: z.infer<typeof aliExportSchema>,
  selections: AliSelection[],
  token: string,
) {
  const key = catalogKey(ownerId);
  const stored = await getJsonVersioned<unknown>(key);
  if (stored.value !== null && !stored.etag)
    throw new AliConflictError(
      "Хранилище не вернуло версию каталога. Изменения не записаны.",
    );
  const current = parseCatalog(stored.value);
  const plan = planAliImport(current, data, selections);
  if (plan.preview.token !== token)
    throw new AliConflictError(
      "Каталог изменился после предпросмотра. Проверьте обновлённое сравнение.",
    );
  if (JSON.stringify(stored.value) !== JSON.stringify(plan.catalog)) {
    try {
      await putJsonConditional(key, plan.catalog, stored.etag);
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 412 || status === 409)
        throw new AliConflictError(
          "Каталог изменился во время сохранения. Повторите предпросмотр.",
        );
      throw error;
    }
  }
  return plan.preview;
}

/** Удаляем старые исключения только после подтверждения записи в браузере. */
export async function acknowledgeImportPreferences(
  ownerId: string,
  entries: { source: string; id: string }[],
) {
  const key = catalogKey(ownerId);
  const acknowledged = new Set(entries.map((entry) =>
    JSON.stringify([entry.source.toLowerCase(), entry.id]),
  ));
  for (let attempt = 0; attempt < 3; attempt++) {
    const stored = await getJsonVersioned<unknown>(key);
    if (stored.value !== null && !stored.etag)
      throw new AliConflictError("Не удалось получить версию каталога");
    const current = parseCatalog(stored.value);
    const catalog = { ...current };
    const remaining = current.legacyIgnoredOrders?.filter((entry) =>
      !acknowledged.has(JSON.stringify([entry.source.toLowerCase(), entry.id])),
    );
    if (remaining?.length) catalog.legacyIgnoredOrders = remaining;
    else delete catalog.legacyIgnoredOrders;
    if (JSON.stringify(stored.value) === JSON.stringify(catalog)) return current;
    try {
      await putJsonConditional(key, catalog, stored.etag);
      return catalog;
    } catch (error) {
      if (
        ![409, 412].includes(
          (error as { $metadata?: { httpStatusCode?: number } })
            .$metadata?.httpStatusCode ?? 0,
        )
      )
        throw error;
    }
  }
  throw new AliConflictError("Каталог изменился. Повторите действие.");
}

async function writeCatalog(
  ownerId: string,
  catalog: Catalog,
): Promise<Catalog> {
  const normalized = normalizeCatalog(catalog);
  await putJson(catalogKey(ownerId), normalized);
  return normalized;
}

export async function getLogistics(ownerId: string): Promise<Logistics> {
  const { orders, shipments, projects } = await readCatalog(ownerId);
  return { orders, shipments, projects };
}

export async function saveProject(ownerId: string, project: Project, create: boolean): Promise<Project | null> {
  const catalog = await readCatalog(ownerId);
  const index = catalog.projects.findIndex((value) => value.id === project.id);
  if (create && index !== -1)
    throw new CatalogValidationError("Проект уже существует");
  if (!create && index === -1) return null;
  if (create) catalog.projects.push(project);
  else catalog.projects[index] = project;
  const saved = await writeCatalog(ownerId, catalog);
  return saved.projects.find((value) => value.id === project.id)!;
}

function toDTO(item: StoredItem): ComponentDTO {
  return item;
}

function matchesQuery(item: StoredItem, q: string, catalog: Catalog): boolean {
  const lower = q.toLowerCase();
  const d = item.data;
  if (d.name?.toLowerCase().includes(lower)) return true;
  if (d.note?.toLowerCase().includes(lower)) return true;
  if (d.type?.toLowerCase().includes(lower)) return true;
  if (d.url?.toLowerCase().includes(lower)) return true;
  if (d.tags?.some((t) => t.toLowerCase().includes(lower))) return true;
  if (d.comments.some((comment) => comment.text.toLowerCase().includes(lower)))
    return true;
  for (const entry of d.purchases ?? d.inventory) {
    if ("project" in entry && entry.project?.toLowerCase().includes(lower))
      return true;
    const order = catalog.orders.find((value) => value.id === entry.orderId);
    if (
      order &&
      [
        order.number,
        order.store,
        ...order.trackingNumbers,
        ...order.comments.map((comment) => comment.text),
      ].some((value) => value?.toLowerCase().includes(lower))
    )
      return true;
    const shipment = catalog.shipments.find(
      (value) => "shipmentId" in entry && value.id === entry.shipmentId,
    );
    if (shipment?.trackingNumber.toLowerCase().includes(lower)) return true;
  }
  if (
    (d.usages ?? []).some((usage) =>
      catalog.projects
        .find((project) => project.id === usage.projectId)
        ?.name.toLowerCase()
        .includes(lower),
    )
  )
    return true;
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
}): Promise<{
  items: ComponentDTO[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const catalog = await readCatalog(params.ownerId);

  const q = params.query?.trim();
  const status = params.status?.trim();
  const type = params.type?.trim();
  const tag = params.tag?.trim();

  let filtered = catalog.items;
  if (q) filtered = filtered.filter((i) => matchesQuery(i, q, catalog));
  if (status)
    filtered = filtered.filter((i) => hasInventoryStatus(i.data, status));
  if (type) filtered = filtered.filter((i) => i.data.type === type);
  if (tag) filtered = filtered.filter((i) => i.data.tags?.includes(tag));

  // Сортируем по убыванию даты обновления (как было в SQL).
  filtered = [...filtered].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  const total = filtered.length;
  const page = Math.max(1, params.page ?? 1);
  const items = params.all
    ? filtered
    : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return { items: items.map(toDTO), total, page, pageSize: PAGE_SIZE };
}

export type Facet = { value: string; count: number };

export async function getFacets(
  ownerId: string,
): Promise<{ types: Facet[]; tags: Facet[] }> {
  const catalog = await readCatalog(ownerId);

  const typeMap = new Map<string, number>();
  const tagMap = new Map<string, number>();

  for (const item of catalog.items) {
    const t = item.data.type?.trim();
    if (t) typeMap.set(t, (typeMap.get(t) ?? 0) + 1);
    for (const tag of item.data.tags ?? []) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
  }

  const toFacets = (map: Map<string, number>): Facet[] =>
    Array.from(map.entries())
      .map(([value, count]) => ({ value, count }))
      .sort(
        (a, b) => b.count - a.count || a.value.localeCompare(b.value, "ru"),
      );

  return { types: toFacets(typeMap), tags: toFacets(tagMap) };
}

export async function getComponent(
  ownerId: string,
  id: string,
): Promise<ComponentDTO | null> {
  const catalog = await readCatalog(ownerId);
  const item = catalog.items.find((i) => i.id === id);
  return item ? toDTO(item) : null;
}

export async function createComponent(
  ownerId: string,
  data: ComponentData,
  logistics?: Logistics,
): Promise<ComponentDTO> {
  const catalog = mergeLogistics(await readCatalog(ownerId), logistics);
  const now = new Date().toISOString();
  const item: StoredItem = {
    id: randomUUID(),
    data,
    createdAt: now,
    updatedAt: now,
  };
  catalog.items.push(item);
  const saved = await writeCatalog(ownerId, catalog);
  return toDTO(saved.items.find((value) => value.id === item.id)!);
}

export async function updateComponent(
  ownerId: string,
  id: string,
  data: ComponentData,
  logistics?: Logistics,
): Promise<ComponentDTO | null> {
  const catalog = mergeLogistics(await readCatalog(ownerId), logistics);
  const idx = catalog.items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  catalog.items[idx] = {
    ...catalog.items[idx],
    data,
    updatedAt: new Date().toISOString(),
  };
  const saved = await writeCatalog(ownerId, catalog);
  return toDTO(saved.items[idx]);
}

export async function deleteComponent(
  ownerId: string,
  id: string,
): Promise<boolean> {
  const catalog = await readCatalog(ownerId);
  const next = catalog.items.filter((i) => i.id !== id);
  if (next.length === catalog.items.length) return false;
  await writeCatalog(ownerId, { ...catalog, items: next });
  return true;
}

export async function importComponents(
  ownerId: string,
  items: { id?: string; data: ComponentData }[],
  logistics?: Logistics,
): Promise<{ created: number; updated: number }> {
  const catalog = mergeLogistics(await readCatalog(ownerId), logistics);
  const ownIds = new Set(catalog.items.map((i) => i.id));
  const now = new Date().toISOString();

  let created = 0;
  let updated = 0;

  for (const item of items) {
    if (item.id && ownIds.has(item.id)) {
      const idx = catalog.items.findIndex((i) => i.id === item.id);
      if (idx !== -1) {
        catalog.items[idx] = {
          ...catalog.items[idx],
          data: item.data,
          updatedAt: now,
        };
        updated++;
      }
    } else {
      const id = item.id || randomUUID();
      catalog.items.push({
        id,
        data: item.data,
        createdAt: now,
        updatedAt: now,
      });
      ownIds.add(id);
      created++;
    }
  }

  await writeCatalog(ownerId, catalog);
  return { created, updated };
}
