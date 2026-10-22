import { createHash } from "node:crypto";
import { z } from "zod";
import { type Catalog, parseCatalog } from "./catalog";
import { type Purchase, PURCHASE_LABELS, componentDataSchema } from "./schema";

const text = z.string().trim().max(4000).nullish();
const url = z
  .string()
  .url()
  .max(4000)
  .refine((s) => /^https?:\/\//i.test(s))
  .nullish();
const quantity = z.number().int().nonnegative().safe();
const itemSchema = z.object({
  title: text,
  image_url: url.refine(
    (value) =>
      !value ||
      /^https:\/\/[^/]+\.(aliexpress-media\.com|alicdn\.com)\//i.test(value),
    "Ожидается изображение AliExpress",
  ),
  product_url: url,
  sku: text,
  quantity: quantity.nullish(),
  price_text: text,
});
const orderSchema = z.object({
  order_id: z.string().trim().min(1).max(200),
  date: text,
  status: text,
  store: text,
  total_text: text,
  order_url: url,
  tracking_url: url,
  tracking_numbers: z
    .array(z.string().trim().min(1).max(200))
    .max(100)
    .default([]),
  shipments: z
    .array(
      z.object({
        tracking_number: text,
        carrier: text,
        status: text,
        last_event: text,
        last_event_time: text,
      }),
    )
    .max(100)
    .default([]),
  tracking_lookup: text,
  items_complete: z.boolean().optional(),
  warnings: z.array(z.string().max(4000)).max(100).default([]),
  items: z.array(itemSchema).max(1000),
});
export const aliExportSchema = z
  .object({
    schema_version: z.literal(1),
    exported_at: z.string().datetime(),
    orders: z.array(orderSchema).min(1).max(5000),
  })
  .superRefine((data, ctx) => {
    const ids = data.orders.map((o) => o.order_id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["orders"],
        message: "В файле повторяются номера заказов",
      });
    if (data.orders.reduce((sum, o) => sum + o.items.length, 0) > 5000)
      ctx.addIssue({
        code: "custom",
        path: ["orders"],
        message: "Не более 5000 товарных позиций",
      });
  });
type AliExport = z.infer<typeof aliExportSchema>;
type AliOrder = AliExport["orders"][number];
export const aliSelectionSchema = z.object({
  rowId: z.string().min(1).max(100),
  componentId: z.string().min(1).max(200).optional(),
  purchaseId: z.string().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  unitsPerPack: quantity.positive().default(1),
  quantity: quantity.nullable().optional(),
  status: z
    .enum(["planned", "in_transit", "delivered", "cancelled", "unassigned"])
    .optional(),
});
export type AliSelection = z.infer<typeof aliSelectionSchema>;
export type AliRow = {
  id: string;
  orderId: string;
  date: string;
  dateSort: string;
  store: string;
  orderUrl?: string;
  title: string;
  imageUrl?: string;
  productUrl?: string;
  sku: string;
  quantity?: number;
  status: Purchase["status"];
  trackingNumbers: string[];
  kind: "new" | "changed" | "unchanged" | "review";
  warnings: string[];
  binding?: {
    componentId: string;
    purchaseId: string;
    unitsPerPack: number;
    quantity?: number;
    status: Purchase["status"];
    quantityOverride?: boolean;
  };
};
export type AliAnalysis = {
  rows: AliRow[];
  components: {
    id: string;
    name: string;
    purchases: {
      id: string;
      order: string;
      quantity?: number;
      status: Purchase["status"];
      aliOrderId?: string;
      productUrl?: string;
      unitsPerPack: number;
    }[];
  }[];
};
export type AliPreview = {
  token: string;
  changes: {
    rowId: string;
    componentId: string;
    name: string;
    action: string;
    details: string[];
  }[];
  warnings: string[];
  created: number;
  updated: number;
  unchanged: number;
};
export class AliImportError extends Error {}
export class AliConflictError extends AliImportError {}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const stableId = (kind: string, key: unknown) =>
  `ali-${kind}-${hash(key).slice(0, 32)}`;
const clean = (value: string | null | undefined) => value?.trim() || undefined;
const norm = (value: string | null | undefined) =>
  clean(value)?.toLowerCase() ?? "";

export function aliProductUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  const parsed = new URL(value);
  const id = parsed.pathname.match(/\/item\/(\d+)\.html/i)?.[1];
  return id
    ? `https://www.aliexpress.com/item/${id}.html`
    : `${parsed.origin}${parsed.pathname}`;
}

function sourceStatus(order: AliOrder): Purchase["status"] {
  switch (norm(order.status)) {
    case "completed":
      return "delivered";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "awaiting delivery":
    case "shipped":
      return "in_transit";
    case "awaiting shipment":
    case "to ship":
    case "awaiting payment":
      return "planned";
    default:
      return "unassigned";
  }
}

function orderDate(value?: string | null): string {
  if (!value) return "";
  // Дата заказа не содержит часового пояса: локальная полночь не должна
  // превращаться в предыдущий день при фильтрации на сервере в UTC+.
  const timestamp = Date.parse(
    /^\d{4}-\d{2}-\d{2}/.test(value) ? value : `${value} UTC`,
  );
  return Number.isNaN(timestamp)
    ? ""
    : new Date(timestamp).toISOString().slice(0, 10);
}

function sourceRows(data: AliExport) {
  return data.orders.flatMap((order) => {
    const keys = order.items.map((item) =>
      JSON.stringify([
        aliProductUrl(item.product_url) ?? norm(item.title),
        norm(item.sku),
      ]),
    );
    const counts = new Map<string, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    return order.items.map((item, index) => {
      const key = keys[index];
      const ambiguous =
        (counts.get(key) ?? 0) > 1 || !item.product_url || !item.title;
      return {
        order,
        item,
        key,
        ambiguous,
        id: stableId("row", [order.order_id, key, ambiguous ? index : null]),
      };
    });
  });
}
type SourceRow = ReturnType<typeof sourceRows>[number];

function findBinding(catalog: Catalog, row: SourceRow) {
  if (row.ambiguous) return undefined;
  const matches = catalog.items.flatMap((component) =>
    (component.data.purchases ?? [])
      .filter(
        (p) =>
          p.aliexpress?.orderId === row.order.order_id &&
          p.aliexpress.itemKey === row.key &&
          !p.aliexpress.ambiguous,
      )
      .map((purchase) => ({ component, purchase })),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function updatePurchase(
  purchase: Purchase,
  row: SourceRow,
  exportedAt: string,
  selection: AliSelection,
) {
  const previous = purchase.aliexpress;
  const warnings: string[] = [];
  const fresh =
    !previous || Date.parse(exportedAt) >= Date.parse(previous.exportedAt);
  let nextQuantity = purchase.quantity;
  let nextStatus = purchase.status;
  const sourceQuantity =
    row.item.quantity == null
      ? undefined
      : row.item.quantity * selection.unitsPerPack;
  if (sourceQuantity !== undefined && !Number.isSafeInteger(sourceQuantity))
    throw new AliImportError("Слишком большое количество");
  const quantityOverride =
    previous?.quantityOverride ||
    selection.quantity !== undefined ||
    (previous
      ? purchase.quantity !== previous.lastQuantity
      : purchase.quantity !== sourceQuantity);
  const statusOverride =
    previous?.statusOverride ||
    selection.status !== undefined ||
    (previous
      ? purchase.status !== previous.lastStatus
      : purchase.status !== sourceStatus(row.order));
  if (selection.quantity !== undefined)
    nextQuantity = selection.quantity ?? undefined;
  else if (
    fresh &&
    previous &&
    !quantityOverride &&
    sourceQuantity !== undefined
  )
    nextQuantity = sourceQuantity;
  const incoming = sourceStatus(row.order);
  if (selection.status) nextStatus = selection.status;
  else if (fresh && previous && !statusOverride && incoming !== "unassigned") {
    const terminal =
      purchase.status === "delivered" || purchase.status === "cancelled";
    const backwards =
      (terminal && incoming !== purchase.status) ||
      (purchase.status === "in_transit" && incoming === "planned");
    if (!backwards) nextStatus = incoming;
    else
      warnings.push(
        "Более ранний статус из выгрузки не применён. При необходимости выберите статус вручную.",
      );
  }
  if (!fresh)
    warnings.push(
      "Выгрузка старее ранее импортированных данных. Автоматическое обновление пропущено.",
    );
  if (
    previous &&
    sourceQuantity !== undefined &&
    quantityOverride &&
    selection.quantity === undefined
  )
    warnings.push("Сохранено количество, исправленное вручную.");
  if (previous && statusOverride && selection.status === undefined)
    warnings.push("Сохранён статус, исправленный вручную.");
  return {
    purchase: {
      ...purchase,
      quantity: nextQuantity,
      status: nextStatus,
      aliexpress: {
        orderId: row.order.order_id,
        itemKey: row.key,
        ambiguous: row.ambiguous || undefined,
        productUrl: aliProductUrl(row.item.product_url) ?? previous?.productUrl,
        sku: clean(row.item.sku) ?? previous?.sku,
        unitsPerPack: selection.unitsPerPack,
        exportedAt: fresh ? exportedAt : previous!.exportedAt,
        lastQuantity: fresh
          ? (sourceQuantity ?? previous?.lastQuantity)
          : previous!.lastQuantity,
        lastStatus: fresh ? incoming : previous!.lastStatus,
        quantityOverride: quantityOverride || undefined,
        statusOverride: statusOverride || undefined,
      },
    } satisfies Purchase,
    warnings,
  };
}

function orderFor(catalog: Catalog, order: AliOrder, purchase?: Purchase) {
  if (purchase) return catalog.orders.find((o) => o.id === purchase.orderId);
  return catalog.orders.find(
    (o) =>
      o.aliexpress?.orderId === order.order_id ||
      (norm(o.source) === "aliexpress" && o.number === order.order_id),
  );
}

function applyOrder(
  catalog: Catalog,
  row: SourceRow,
  exportedAt: string,
  purchase?: Purchase,
) {
  const source = row.order;
  let order = orderFor(catalog, source, purchase);
  if (order?.aliexpress && order.aliexpress.orderId !== source.order_id)
    throw new AliImportError(
      "Эта покупка уже связана с другим заказом AliExpress",
    );
  if (!order) {
    order = {
      id: stableId("order", source.order_id),
      number: source.order_id,
      source: "AliExpress",
      comments: [],
      trackingNumbers: [],
    };
    catalog.orders.push(order);
  }
  const before = JSON.stringify(order);
  const fresh =
    !order.aliexpress ||
    Date.parse(exportedAt) >= Date.parse(order.aliexpress.exportedAt);
  if (fresh) {
    order.store ||= clean(source.store)?.slice(0, 200);
    order.url ||= clean(source.order_url);
    if (
      source.tracking_lookup !== "cached" ||
      order.trackingNumbers.length === 0
    ) {
      const tracks = new Map(
        order.trackingNumbers.map((track) => [track.toLowerCase(), track]),
      );
      for (const track of source.tracking_numbers)
        tracks.set(track.toLowerCase(), track);
      order.trackingNumbers = [...tracks.values()];
    }
    order.aliexpress = {
      orderId: source.order_id,
      exportedAt,
      date: clean(source.date) ?? order.aliexpress?.date,
      status: clean(source.status) ?? order.aliexpress?.status,
      total: clean(source.total_text) ?? order.aliexpress?.total,
      shipments:
        source.tracking_lookup === "cached" || source.shipments.length === 0
          ? order.aliexpress?.shipments
          : (() => {
              const saved = new Map(
                (order.aliexpress?.shipments ?? []).map((shipment) => [
                  shipment.trackingNumber.toLowerCase(),
                  shipment,
                ]),
              );
              for (const shipment of source.shipments) {
                const trackingNumber = clean(shipment.tracking_number);
                if (!trackingNumber) continue;
                const previous = saved.get(trackingNumber.toLowerCase());
                saved.set(trackingNumber.toLowerCase(), {
                  trackingNumber,
                  carrier: clean(shipment.carrier) ?? previous?.carrier,
                  status: clean(shipment.status) ?? previous?.status,
                  lastEvent: clean(shipment.last_event) ?? previous?.lastEvent,
                  lastEventTime:
                    clean(shipment.last_event_time) ?? previous?.lastEventTime,
                });
              }
              return [...saved.values()];
            })(),
    };
  }
  const semanticOrder = (value: typeof order) => ({
    ...value,
    aliexpress: value.aliexpress
      ? { ...value.aliexpress, exportedAt: undefined }
      : undefined,
  });
  return {
    order,
    changed:
      JSON.stringify(semanticOrder(JSON.parse(before))) !==
      JSON.stringify(semanticOrder(order)),
  };
}

export function analyzeAli(catalog: Catalog, data: AliExport): AliAnalysis {
  const rows = sourceRows(data)
    .map((row): AliRow => {
      const binding = findBinding(catalog, row);
      const warnings = [...row.order.warnings];
      if (row.ambiguous)
        warnings.push(
          "Неполная или повторяющаяся позиция: сопоставьте её вручную.",
        );
      if (!row.item.title) warnings.push("В выгрузке нет названия товара.");
      if (row.order.tracking_lookup === "cached")
        warnings.push("Трекинг из кэша: сохранённые треки не меняются.");
      if (sourceStatus(row.order) === "unassigned")
        warnings.push(
          "Статус AliExpress не распознан: уточните состояние покупки.",
        );
      let kind: AliRow["kind"] =
        row.ambiguous || sourceStatus(row.order) === "unassigned"
          ? "review"
          : "new";
      let projected: Purchase | undefined;
      if (binding) {
        const selection = {
          rowId: row.id,
          unitsPerPack: binding.purchase.aliexpress!.unitsPerPack,
        };
        const next = updatePurchase(
          binding.purchase,
          row,
          data.exported_at,
          selection,
        );
        projected = next.purchase;
        warnings.push(...next.warnings);
        const copy = { ...catalog, orders: structuredClone(catalog.orders) };
        const updatedOrder = applyOrder(
          copy,
          row,
          data.exported_at,
          binding.purchase,
        ).order;
        const previousOrder = catalog.orders.find(
          (o) => o.id === binding.purchase.orderId,
        )!;
        const oldOrder = {
          ...previousOrder,
          aliexpress: { ...previousOrder.aliexpress, exportedAt: undefined },
        };
        const newOrder = {
          ...updatedOrder,
          aliexpress: { ...updatedOrder.aliexpress, exportedAt: undefined },
        };
        kind =
          next.purchase.quantity !== binding.purchase.quantity ||
          next.purchase.status !== binding.purchase.status ||
          JSON.stringify(oldOrder) !== JSON.stringify(newOrder) ||
          previousOrder.aliexpress?.status !== updatedOrder.aliexpress?.status
            ? "changed"
            : "unchanged";
      }
      return {
        id: row.id,
        orderId: row.order.order_id,
        date: clean(row.order.date) ?? "Без даты",
        dateSort: orderDate(row.order.date),
        store: clean(row.order.store) ?? "",
        orderUrl: clean(row.order.order_url),
        title: clean(row.item.title) ?? "Без названия",
        imageUrl: clean(row.item.image_url),
        productUrl: aliProductUrl(row.item.product_url),
        sku: clean(row.item.sku) ?? "",
        quantity: row.item.quantity ?? undefined,
        status: sourceStatus(row.order),
        trackingNumbers: row.order.tracking_numbers,
        kind,
        warnings: [...new Set(warnings)],
        binding: binding
          ? {
              componentId: binding.component.id,
              purchaseId: binding.purchase.id,
              unitsPerPack: binding.purchase.aliexpress!.unitsPerPack,
              quantity: projected!.quantity,
              status: projected!.status,
              quantityOverride: projected!.aliexpress?.quantityOverride,
            }
          : undefined,
      };
    })
    .sort(
      (a, b) =>
        b.dateSort.localeCompare(a.dateSort) ||
        b.orderId.localeCompare(a.orderId),
    );
  return {
    rows,
    components: catalog.items
      .map((item) => ({
        id: item.id,
        name: item.data.name,
        purchases: (item.data.purchases ?? []).map((p) => ({
          id: p.id,
          order:
            catalog.orders.find((o) => o.id === p.orderId)?.number ?? p.orderId,
          quantity: p.quantity,
          status: p.status,
          aliOrderId: p.aliexpress?.orderId,
          productUrl: p.aliexpress?.productUrl,
          unitsPerPack: p.aliexpress?.unitsPerPack ?? 1,
        })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru")),
  };
}

export function planAliImport(
  catalog: Catalog,
  data: AliExport,
  selections: AliSelection[],
) {
  if (!selections.length)
    throw new AliImportError("Выберите хотя бы один товар");
  if (new Set(selections.map((s) => s.rowId)).size !== selections.length)
    throw new AliImportError("Повторяющиеся позиции");
  const next = structuredClone(catalog);
  const rows = new Map(sourceRows(data).map((row) => [row.id, row]));
  const changes: AliPreview["changes"] = [];
  const warnings = new Set<string>();
  const touched = new Set<string>();
  let created = 0,
    updated = 0,
    unchanged = 0;
  for (const selection of selections) {
    const row = rows.get(selection.rowId);
    if (!row) throw new AliImportError("Товар не найден в выгрузке");
    const automatic = findBinding(next, row);
    const componentId = selection.componentId ?? automatic?.component.id;
    let component = componentId
      ? next.items.find((item) => item.id === componentId)
      : undefined;
    if (componentId && !component)
      throw new AliImportError("Компонент больше не существует");
    const purchaseId = selection.purchaseId ?? automatic?.purchase.id;
    let purchase = purchaseId
      ? component?.data.purchases?.find((p) => p.id === purchaseId)
      : undefined;
    if (purchaseId && !purchase)
      throw new AliImportError("Покупка больше не существует");
    if (
      automatic &&
      (component?.id !== automatic.component.id ||
        purchase?.id !== automatic.purchase.id)
    )
      throw new AliImportError("Позиция уже привязана к другой покупке");
    if (
      purchase?.aliexpress &&
      (purchase.aliexpress.orderId !== row.order.order_id ||
        (purchase.aliexpress.itemKey !== row.key &&
          (!selection.purchaseId ||
            purchase.aliexpress.productUrl !==
              aliProductUrl(row.item.product_url))))
    )
      throw new AliImportError(
        "Выбранная покупка уже связана с другим товаром",
      );
    const targetKey = purchase ? `${component!.id}:${purchase.id}` : "";
    if (targetKey && touched.has(targetKey))
      throw new AliImportError(
        "Одну покупку нельзя связать с несколькими позициями",
      );
    if (targetKey) touched.add(targetKey);
    const isNewComponent = !component;
    if (!component) {
      const name = selection.name ?? clean(row.item.title)?.slice(0, 200);
      if (!name) throw new AliImportError("Укажите название нового компонента");
      const id = stableId("component", row.id);
      if (next.items.some((item) => item.id === id))
        throw new AliImportError(
          "Компонент уже импортирован. Выберите существующую покупку.",
        );
      component = {
        id,
        data: componentDataSchema.parse({
          name,
          images: row.item.image_url ? [row.item.image_url] : [],
          url: clean(row.item.product_url),
          purchases: [],
          usages: [],
        }),
        createdAt: data.exported_at,
        updatedAt: data.exported_at,
      };
      next.items.push(component);
    }
    const isNewPurchase = !purchase;
    const orderResult = applyOrder(next, row, data.exported_at, purchase);
    if (!purchase) {
      const id = stableId("purchase", row.id);
      if (
        next.items.some((item) => item.data.purchases?.some((p) => p.id === id))
      )
        throw new AliImportError(
          "Покупка уже импортирована. Выберите её для обновления.",
        );
      purchase = {
        id,
        orderId: orderResult.order.id,
        quantity:
          selection.quantity !== undefined
            ? (selection.quantity ?? undefined)
            : row.item.quantity == null
              ? undefined
              : row.item.quantity * selection.unitsPerPack,
        status: selection.status ?? sourceStatus(row.order),
      };
    }
    const previous = { ...purchase };
    const result = updatePurchase(purchase, row, data.exported_at, selection);
    for (const warning of result.warnings) warnings.add(warning);
    if (row.ambiguous)
      warnings.add(
        "Повторяющиеся и неполные позиции нужно сопоставлять вручную при каждой загрузке.",
      );
    if (row.order.tracking_lookup === "cached")
      warnings.add("Трекинг из кэша не обновляет сохранённые треки.");
    const details: string[] = [];
    if (isNewPurchase || previous.quantity !== result.purchase.quantity)
      details.push(
        `Количество: ${isNewPurchase ? "—" : (previous.quantity ?? "неизвестно")} → ${result.purchase.quantity ?? "неизвестно"}`,
      );
    if (isNewPurchase || previous.status !== result.purchase.status)
      details.push(
        `Статус: ${isNewPurchase ? "—" : PURCHASE_LABELS[previous.status]} → ${PURCHASE_LABELS[result.purchase.status]}`,
      );
    const oldOrder = catalog.orders.find((o) => o.id === orderResult.order.id);
    if (
      JSON.stringify(oldOrder?.trackingNumbers ?? []) !==
      JSON.stringify(orderResult.order.trackingNumbers)
    )
      details.push(
        `Треки: ${oldOrder?.trackingNumbers.join(", ") || "—"} → ${orderResult.order.trackingNumbers.join(", ") || "—"}`,
      );
    if (!isNewPurchase && !previous.aliexpress)
      details.push(
        `Связать существующую покупку с заказом ${row.order.order_id}`,
      );
    if (orderResult.changed) {
      if (oldOrder?.aliexpress?.date !== orderResult.order.aliexpress?.date)
        details.push(
          `Дата заказа: ${orderResult.order.aliexpress?.date ?? "—"}`,
        );
      if (oldOrder?.store !== orderResult.order.store)
        details.push(`Магазин: ${orderResult.order.store ?? "—"}`);
      if (oldOrder?.url !== orderResult.order.url)
        details.push(`Ссылка на заказ: ${orderResult.order.url ?? "—"}`);
      if (oldOrder?.aliexpress?.status !== orderResult.order.aliexpress?.status)
        details.push(
          `Статус AliExpress: ${orderResult.order.aliexpress?.status ?? "—"}`,
        );
      if (oldOrder?.aliexpress?.total !== orderResult.order.aliexpress?.total)
        details.push(
          `Сумма заказа: ${orderResult.order.aliexpress?.total ?? "—"}`,
        );
      if (
        JSON.stringify(oldOrder?.aliexpress?.shipments) !==
        JSON.stringify(orderResult.order.aliexpress?.shipments)
      )
        details.push(
          ...(orderResult.order.aliexpress?.shipments ?? []).map(
            (s) =>
              `Доставка ${s.trackingNumber}: ${[s.carrier, s.status, s.lastEvent, s.lastEventTime].filter(Boolean).join(" · ")}`,
          ),
        );
    }
    const changed = isNewPurchase || details.length > 0 || orderResult.changed;
    component.data.purchases = isNewPurchase
      ? [...(component.data.purchases ?? []), result.purchase]
      : component.data.purchases!.map((p) =>
          p.id === purchase!.id ? result.purchase : p,
        );
    if (changed) component.updatedAt = new Date().toISOString();
    if (isNewComponent) created++;
    else if (changed) updated++;
    else unchanged++;
    changes.push({
      rowId: row.id,
      componentId: component.id,
      name: component.data.name,
      action: isNewComponent
        ? "Создать компонент и покупку"
        : isNewPurchase
          ? "Добавить покупку"
          : details.length
            ? "Обновить покупку"
            : "Без изменений",
      details,
    });
  }
  // Полная проверка связей, количеств и схемы до единственной записи в хранилище.
  const validated = parseCatalog(JSON.parse(JSON.stringify(next)));
  const token = hash({ catalog, data, selections });
  return {
    catalog: validated,
    preview: {
      token,
      changes,
      warnings: [...warnings],
      created,
      updated,
      unchanged,
    } satisfies AliPreview,
  };
}
