import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CatalogValidationError,
  normalizeCatalog,
  parseCatalog,
  type Catalog,
} from "./catalog";
import { getJsonVersioned, putJsonConditional } from "./s3";
import { componentDataSchema } from "./schema";
import { getProjectComponentsVersion } from "./project-components";

const idSchema = z.string().trim().min(1).max(200);
export const projectOrderSchema = z.object({
  ids: z
    .array(idSchema)
    .max(10000)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Повторяющиеся идентификаторы",
    ),
});
export const projectComponentsSchema = z.object({
  components: z
    .array(
      z.object({
        id: idSchema,
        quantity: z.number().int().nonnegative().safe().optional(),
      }),
    )
    .max(10000)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      "Повторяющиеся компоненты",
    ),
  expected: z.string().max(4_000_000),
});
export class ProjectConflictError extends Error {}
export class ProjectNotFoundError extends Error {}

function exactOrder(current: string[], requested: string[]) {
  if (
    current.length !== requested.length ||
    new Set(requested).size !== requested.length ||
    requested.some((id) => !current.includes(id))
  )
    throw new ProjectConflictError(
      "Список изменился. Обновите страницу и повторите действие.",
    );
}

/** Retry only after re-reading and reapplying a narrow operation to the latest catalog. */
export async function mutateProjectCatalog<T>(
  ownerId: string,
  operation: (catalog: Catalog) => T,
): Promise<T> {
  const key = `users/${ownerId}/catalog.json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const stored = await getJsonVersioned<unknown>(key);
    if (stored.value !== null && !stored.etag)
      throw new ProjectConflictError(
        "Хранилище не вернуло версию каталога. Изменения не записаны.",
      );
    const catalog = parseCatalog(stored.value);
    const result = operation(catalog);
    if (result === null) return result;
    const next = normalizeCatalog(catalog);
    try {
      await putJsonConditional(key, next, stored.etag);
      return result;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status !== 409 && status !== 412) throw error;
    }
  }
  throw new ProjectConflictError(
    "Каталог изменился во время сохранения. Повторите действие.",
  );
}

export async function reorderProjects(ownerId: string, ids: string[]) {
  return mutateProjectCatalog(ownerId, (catalog) => {
    exactOrder(
      catalog.projects.map((project) => project.id),
      ids,
    );
    const projects = new Map(
      catalog.projects.map((project) => [project.id, project]),
    );
    catalog.projects = ids.map((id) => projects.get(id)!);
    return { ids };
  });
}

export async function reorderProjectComponents(
  ownerId: string,
  projectId: string,
  ids: string[],
) {
  return mutateProjectCatalog(ownerId, (catalog) => {
    const project = catalog.projects.find(
      (project) => project.id === projectId,
    );
    if (!project) throw new ProjectNotFoundError("Проект не найден");
    const current = catalog.items.filter((item) =>
      item.data.usages?.some((usage) => usage.projectId === projectId),
    );
    exactOrder(
      current.map((item) => item.id),
      ids,
    );
    project.componentOrder = ids;
    return { project };
  });
}

export async function saveProjectComponents(
  ownerId: string,
  projectId: string,
  input: z.infer<typeof projectComponentsSchema>,
) {
  return mutateProjectCatalog(ownerId, (catalog) => {
    const project = catalog.projects.find(
      (project) => project.id === projectId,
    );
    if (!project) throw new ProjectNotFoundError("Проект не найден");
    if (
      input.expected !== getProjectComponentsVersion(catalog.items, projectId)
    )
      throw new ProjectConflictError(
        "Компоненты проекта изменились. Обновите страницу перед сохранением.",
      );
    const selected = new Map(input.components.map((item) => [item.id, item]));
    if (selected.size !== input.components.length)
      throw new CatalogValidationError("Повторяющиеся компоненты");
    if (
      input.components.some(
        (entry) => !catalog.items.some((item) => item.id === entry.id),
      )
    )
      throw new CatalogValidationError("Компонент не найден в вашем каталоге");
    for (const item of catalog.items) {
      const old = item.data.usages ?? [];
      const own = old.filter((usage) => usage.projectId === projectId);
      const entry = selected.get(item.id);
      if (!entry && !own.length) continue;
      const aggregate = own.some((usage) => usage.quantity === undefined)
        ? undefined
        : own.reduce((sum, usage) => sum + (usage.quantity ?? 0), 0);
      // Preserve multiple usage entries, their IDs and partial unknown quantities when unchanged.
      if (entry && own.length && entry.quantity === aggregate) continue;
      const next = old.filter((usage) => usage.projectId !== projectId);
      if (entry)
        next.push({
          id: own[0]?.id ?? randomUUID(),
          projectId,
          quantity: entry.quantity,
        });
      const parsed = componentDataSchema.safeParse({
        ...item.data,
        usages: next,
      });
      if (!parsed.success)
        throw new CatalogValidationError(parsed.error.issues[0].message);
      item.data = parsed.data;
      item.updatedAt = new Date().toISOString();
    }
    // Existing order is not replaced by a stale picker. New selections append.
    project.componentOrder = [
      ...(project.componentOrder ?? []).filter((id) => selected.has(id)),
      ...input.components
        .map((entry) => entry.id)
        .filter((id) => !project.componentOrder?.includes(id)),
    ];
    return {
      project,
      components: catalog.items,
      version: getProjectComponentsVersion(catalog.items, projectId),
    };
  });
}
