import { z } from "zod";
import { createHash } from "node:crypto";
import {
  componentDataSchema,
  logisticsSchema,
  type ComponentData,
  type Logistics,
} from "./schema";

export type CatalogItem = {
  id: string;
  data: ComponentData;
  createdAt: string;
  updatedAt: string;
};
export type Catalog = Logistics & {
  version: 2;
  items: CatalogItem[];
  projects: NonNullable<Logistics["projects"]>;
};
const itemSchema = z.object({
  id: z.string().min(1),
  data: componentDataSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
const catalogSchema = logisticsSchema.extend({
  version: z.literal(2),
  items: z.array(itemSchema),
});

export class CatalogValidationError extends Error {}

export function parseCatalog(raw: unknown): Catalog {
  const catalog = catalogSchema.parse(
    Array.isArray(raw)
      ? { version: 2, items: raw }
      : (raw ?? { version: 2, items: [] }),
  );
  return normalizeCatalog({ ...catalog, projects: catalog.projects ?? [] });
}

/** Старые остатки сохраняются как архив; новый учёт строится на заказах и проектах. */
export function normalizeCatalog(catalog: Catalog): Catalog {
  validateCatalog(catalog);
  const orders = catalog.orders.map((order) => ({
    ...order,
    trackingNumbers: [...order.trackingNumbers],
  }));
  const projects = [...catalog.projects];
  const stableId = (kind: string, key: string) =>
    `${kind}-${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
  const items = catalog.items.map((item) => {
    if (item.data.purchases !== undefined) return item;
    const purchases: NonNullable<ComponentData["purchases"]> = [];
    const usages: NonNullable<ComponentData["usages"]> = [];
    for (const entry of item.data.inventory) {
      const shipment = catalog.shipments.find(
        (value) => value.id === entry.shipmentId,
      );
      const orderId =
        entry.orderId ?? stableId("legacy-order", shipment?.id ?? item.id);
      let order = orders.find((value) => value.id === orderId);
      if (!order) {
        order = {
          id: orderId,
          number:
            shipment?.trackingNumber ??
            `${item.data.name} · Запасы`.slice(0, 200),
          source: `legacy:${orderId}`,
          comments: [],
          trackingNumbers: [],
        };
        orders.push(order);
      }
      if (
        shipment &&
        !order.trackingNumbers.some(
          (track) =>
            track.toLowerCase() === shipment.trackingNumber.toLowerCase(),
        )
      )
        order.trackingNumbers.push(shipment.trackingNumber);
      const status =
        entry.status === "used" || entry.status === "in_stock"
          ? "delivered"
          : entry.status;
      const existing = purchases.find(
        (value) =>
          value.orderId === orderId &&
          value.status === status &&
          value.quantity !== undefined &&
          entry.quantity !== undefined,
      );
      if (existing) existing.quantity! += entry.quantity!;
      else
        purchases.push({
          id: entry.id,
          orderId,
          status,
          quantity: entry.quantity,
        });
      if (entry.status === "used") {
        const name = entry.project?.trim() || "Без проекта";
        let project = projects.find(
          (value) => value.name.toLowerCase() === name.toLowerCase(),
        );
        if (!project) {
          project = {
            id: stableId("legacy-project", name.toLowerCase()),
            name,
          };
          projects.push(project);
        }
        usages.push({
          id: entry.id,
          projectId: project.id,
          quantity: entry.quantity,
        });
      }
    }
    return { ...item, data: { ...item.data, purchases, usages } };
  });
  // Даже не привязанные к компонентам посылки остаются доступны как заказы.
  for (const shipment of catalog.shipments) {
    const known = orders.some((order) =>
      order.trackingNumbers.some(
        (track) =>
          track.toLowerCase() === shipment.trackingNumber.toLowerCase(),
      ),
    );
    const id = stableId("legacy-order", shipment.id);
    if (
      !known &&
      !orders.some((order) => order.id === id) &&
      !catalog.items.some(
        (item) =>
          item.data.purchases !== undefined &&
          [...item.data.inventory, ...item.data.history].some(
            (entry) => entry.shipmentId === shipment.id,
          ),
      )
    ) {
      orders.push({
        id,
        number: shipment.trackingNumber,
        source: `legacy:${id}`,
        comments: [],
        trackingNumbers: [shipment.trackingNumber],
      });
    }
  }
  const normalized = { ...catalog, items, orders, projects };
  validateCatalog(normalized);
  return normalized;
}

export function mergeLogistics(catalog: Catalog, patch?: Logistics): Catalog {
  if (!patch) return catalog;
  for (const collection of [
    patch.orders,
    patch.shipments,
    patch.projects ?? [],
  ]) {
    if (new Set(collection.map((item) => item.id)).size !== collection.length)
      throw new CatalogValidationError(
        "Повторяющиеся идентификаторы заказов или посылок",
      );
  }
  const merge = <T extends { id: string }>(current: T[], incoming: T[]) => {
    const map = new Map(current.map((item) => [item.id, item]));
    for (const item of incoming) map.set(item.id, item);
    return [...map.values()];
  };
  return {
    ...catalog,
    orders: merge(catalog.orders, patch.orders),
    shipments: merge(catalog.shipments, patch.shipments),
    projects: merge(catalog.projects, patch.projects ?? []),
  };
}

export function validateCatalog(catalog: Catalog) {
  for (const collection of [
    catalog.items,
    catalog.orders,
    catalog.shipments,
    catalog.projects,
  ]) {
    if (new Set(collection.map((item) => item.id)).size !== collection.length)
      throw new CatalogValidationError("Повторяющиеся идентификаторы");
  }
  const tracks = catalog.shipments.map((shipment) =>
    shipment.trackingNumber.toLowerCase(),
  );
  if (new Set(tracks).size !== tracks.length)
    throw new CatalogValidationError(
      "Этот трек уже существует. Выберите существующую посылку.",
    );
  const orderKeys = catalog.orders.map(
    (order) => `${order.source.toLowerCase()}:${order.number.toLowerCase()}`,
  );
  if (new Set(orderKeys).size !== orderKeys.length)
    throw new CatalogValidationError(
      "Этот заказ уже существует. Выберите существующий заказ.",
    );
  const orders = new Set(catalog.orders.map((order) => order.id));
  for (const order of catalog.orders) {
    if (
      new Set(order.comments.map((comment) => comment.id)).size !==
      order.comments.length
    )
      throw new CatalogValidationError("Повторяющиеся комментарии заказа");
  }
  const shipments = new Set(catalog.shipments.map((shipment) => shipment.id));
  const projects = new Set(catalog.projects.map((project) => project.id));
  if (
    new Set(catalog.projects.map((project) => project.name.toLowerCase()))
      .size !== catalog.projects.length
  )
    throw new CatalogValidationError(
      "Проект с таким названием уже есть. Выберите его из списка.",
    );
  for (const item of catalog.items) {
    for (const entry of [...item.data.inventory, ...item.data.history]) {
      if (entry.orderId && !orders.has(entry.orderId))
        throw new CatalogValidationError("Не найден связанный заказ");
      if (entry.shipmentId && !shipments.has(entry.shipmentId))
        throw new CatalogValidationError("Не найдена связанная посылка");
    }
    for (const purchase of item.data.purchases ?? []) {
      if (!orders.has(purchase.orderId))
        throw new CatalogValidationError("Не найден связанный заказ");
    }
    for (const usage of item.data.usages ?? []) {
      if (!projects.has(usage.projectId))
        throw new CatalogValidationError("Не найден связанный проект");
    }
    const delivered = (item.data.purchases ?? []).filter(
      (purchase) => purchase.status === "delivered",
    );
    const usages = item.data.usages ?? [];
    const received = delivered.reduce(
      (sum, purchase) => sum + (purchase.quantity ?? 0),
      0,
    );
    const used = usages.reduce((sum, usage) => sum + (usage.quantity ?? 0), 0);
    if (!Number.isSafeInteger(received) || !Number.isSafeInteger(used))
      throw new CatalogValidationError("Суммарное количество слишком большое");
    if (
      item.data.purchases &&
      ![...delivered, ...usages].some(
        (entry) => entry.quantity === undefined,
      ) &&
      used > received
    )
      throw new CatalogValidationError(
        `«${item.data.name}»: использовано больше, чем доставлено`,
      );
  }
}
