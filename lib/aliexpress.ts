import { createHash } from "node:crypto";
import { z } from "zod";
import {
  type Catalog,
  type CatalogItem,
  parseCatalog,
  mergeLogistics,
} from "./catalog";
import {
  type Purchase,
  type Logistics,
  PURCHASE_LABELS,
  componentDataSchema,
  logisticsSchema,
} from "./schema";

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
  componentDraft: z
    .object({
      data: componentDataSchema,
      logistics: logisticsSchema.optional(),
    })
    .optional(),
  unitsPerPack: quantity.positive().default(1),
  quantity: quantity.nullable().optional(),
  status: z
    .enum(["planned", "in_transit", "delivered", "cancelled", "unassigned"])
    .optional(),
});
export type AliSelection = z.infer<typeof aliSelectionSchema>;
export type AliRow = {
  id: string;
  itemKey: string;
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
  changes: string[];
  warnings: string[];
  ignored: boolean;
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
  legacyIgnoredOrders?: { source: string; id: string }[];
  logistics: Logistics;
  components: {
    id: string;
    name: string;
    data: CatalogItem["data"];
    createdAt: string;
    updatedAt: string;
    purchases: {
      id: string;
      order: string;
      quantity?: number;
      status: Purchase["status"];
      externalOrderNumber?: string;
      productUrl?: string;
      unitsPerPack: number;
    }[];
  }[];
};
export type AliPreview = {
  token: string;
  changes: {
    rowId: string;
    orderNumber: string;
    componentId: string;
    name: string;
    action: string;
    details: string[];
    before?: CatalogItem;
    after: CatalogItem;
    fields: { label: string; before: string; after: string }[];
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
  const order = findAliOrder(catalog, row.order.order_id);
  if (!order) return undefined;
  const purchases = catalog.items.flatMap((component) =>
    (component.data.purchases ?? [])
      .filter((purchase) => purchase.orderId === order.id)
      .map((purchase) => ({ component, purchase })),
  );
  const matches = purchases.filter(({ purchase }) =>
    purchase.importState?.matchKey === row.key && !purchase.importState.needsManualMatch,
  );
  if (
    !matches.length && row.order.items.length === 1 && purchases.length === 1 &&
    !purchases[0].purchase.importState
  ) return purchases[0];
  return matches.length === 1 ? matches[0] : undefined;
}

function updatePurchase(
  purchase: Purchase,
  row: SourceRow,
  exportedAt: string,
  selection: AliSelection,
) {
  const previous = purchase.importState;
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
    previous?.manualFields.includes("quantity") ||
    selection.quantity !== undefined ||
    (previous
      ? purchase.quantity !== previous.lastQuantity
      : purchase.quantity !== sourceQuantity);
  const statusOverride =
    previous?.manualFields.includes("status") ||
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
      productUrl: aliProductUrl(row.item.product_url) ?? purchase.productUrl,
      variant: clean(row.item.sku) ?? purchase.variant,
      unitsPerPack: selection.unitsPerPack,
      importState: {
        matchKey: row.key,
        needsManualMatch: row.ambiguous || undefined,
        exportedAt: fresh ? exportedAt : previous!.exportedAt,
        lastQuantity: fresh
          ? (sourceQuantity ?? previous?.lastQuantity)
          : previous!.lastQuantity,
        lastStatus: fresh ? incoming : previous!.lastStatus,
        manualFields: [
          ...(quantityOverride ? ["quantity" as const] : []),
          ...(statusOverride ? ["status" as const] : []),
        ],
      },
    } satisfies Purchase,
    warnings,
  };
}

function findAliOrder(catalog: Catalog, number: string) {
  return catalog.orders.find(
    (o) =>
      norm(o.source) === "aliexpress" && norm(o.number) === norm(number),
  );
}

function orderFor(catalog: Catalog, order: AliOrder, purchase?: Purchase) {
  return findAliOrder(catalog, order.order_id) ??
    (purchase ? catalog.orders.find((o) => o.id === purchase.orderId) : undefined);
}

function rememberOrderCaption(
  order: Catalog["orders"][number], caption: string, date: string,
) {
  const id = stableId("comment", [order.id, caption]);
  if (!order.comments.some((comment) => comment.id === id))
    order.comments.push({
      id, text: `Прежнее название заказа: ${caption}`, createdAt: date,
    });
}

function applyOrder(
  catalog: Catalog,
  row: SourceRow,
  exportedAt: string,
  purchase?: Purchase,
) {
  const source = row.order;
  const linkedOrder = purchase &&
    catalog.orders.find((o) => o.id === purchase.orderId);
  if (
    linkedOrder && norm(linkedOrder.source) === "aliexpress" &&
    norm(linkedOrder.number) !== norm(source.order_id)
  )
    throw new AliImportError(
      "Эта покупка уже связана с другим заказом AliExpress",
    );
  let order = orderFor(catalog, source, purchase);
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
  if (order.number !== source.order_id)
    rememberOrderCaption(order, order.number, exportedAt);
  order.number = source.order_id;
  order.source = "AliExpress";
  const fresh =
    !order.importState ||
    Date.parse(exportedAt) >= Date.parse(order.importState.exportedAt);
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
    order.importState = { exportedAt };
    order.date = clean(source.date) ?? order.date;
    order.sourceStatus = clean(source.status) ?? order.sourceStatus;
    order.totalText = clean(source.total_text) ?? order.totalText;
    order.trackingDetails =
        source.tracking_lookup === "cached" || source.shipments.length === 0
          ? order.trackingDetails
          : (() => {
              const saved = new Map(
                (order.trackingDetails ?? []).map((shipment) => [
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
            })();
  }
  const semanticOrder = (value: typeof order) => ({
    ...value,
    importState: undefined,
  });
  return {
    order,
    changed:
      JSON.stringify(semanticOrder(JSON.parse(before))) !==
      JSON.stringify(semanticOrder(order)),
  };
}

function describeChanges(
  before: Purchase | undefined, after: Purchase,
  previousOrder: Catalog["orders"][number] | undefined,
  order: Catalog["orders"][number],
) {
  const changes: string[] = [];
  if (!before || before.quantity !== after.quantity)
    changes.push(`Количество: ${before ? before.quantity ?? "неизвестно" : "—"} → ${after.quantity ?? "неизвестно"}`);
  if (!before || before.status !== after.status)
    changes.push(`Статус: ${before ? PURCHASE_LABELS[before.status] : "—"} → ${PURCHASE_LABELS[after.status]}`);
  if (JSON.stringify(previousOrder?.trackingNumbers ?? []) !== JSON.stringify(order.trackingNumbers))
    changes.push(`Треки: ${previousOrder?.trackingNumbers.join(", ") || "—"} → ${order.trackingNumbers.join(", ") || "—"}`);
  for (const [key, label] of [
    ["number", "Номер заказа"], ["source", "Источник"], ["date", "Дата заказа"],
    ["store", "Магазин"], ["url", "Ссылка на заказ"],
    ["sourceStatus", "Статус источника"], ["totalText", "Сумма заказа"],
  ] as const) {
    if (previousOrder?.[key] !== order[key])
      changes.push(`${label}: ${previousOrder?.[key] || "—"} → ${order[key] || "—"}`);
  }
  if (JSON.stringify(previousOrder?.trackingDetails) !== JSON.stringify(order.trackingDetails)) {
    for (const shipment of order.trackingDetails ?? []) {
      const previous = previousOrder?.trackingDetails?.find((s) => s.trackingNumber.toLowerCase() === shipment.trackingNumber.toLowerCase());
      if (JSON.stringify(previous) !== JSON.stringify(shipment)) {
        const text = (value: typeof previous) => value && [value.carrier, value.status, value.lastEvent, value.lastEventTime].filter(Boolean).join(" · ") || "—";
        changes.push(`Доставка ${shipment.trackingNumber}: ${text(previous)} → ${text(shipment)}`);
      }
    }
  }
  return changes;
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
      let changes: string[] = [];
      if (binding) {
        const selection = {
          rowId: row.id,
          unitsPerPack: binding.purchase.unitsPerPack ?? 1,
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
        changes = describeChanges(binding.purchase, next.purchase, previousOrder, updatedOrder);
        kind = changes.length ? "changed" : "unchanged";
      }
      return {
        id: row.id,
        itemKey: row.key,
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
        changes,
        warnings: [...new Set(warnings)],
        ignored: false,
        binding: binding
          ? {
              componentId: binding.component.id,
              purchaseId: binding.purchase.id,
              unitsPerPack: binding.purchase.unitsPerPack ?? 1,
              quantity: projected!.quantity,
              status: projected!.status,
              quantityOverride: projected!.importState?.manualFields.includes("quantity"),
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
    legacyIgnoredOrders: catalog.legacyIgnoredOrders,
    logistics: {
      orders: catalog.orders,
      shipments: catalog.shipments,
      projects: catalog.projects,
    },
    components: catalog.items
      .map((item) => ({
        id: item.id,
        name: item.data.name,
        data: item.data,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        purchases: (item.data.purchases ?? []).map((p) => ({
          id: p.id,
          order:
            catalog.orders.find((o) => o.id === p.orderId)?.number ?? p.orderId,
          quantity: p.quantity,
          status: p.status,
          externalOrderNumber: (() => {
            const order = catalog.orders.find((o) => o.id === p.orderId);
            return order && norm(order.source) === "aliexpress"
              ? order.number : undefined;
          })(),
          productUrl: p.productUrl,
          unitsPerPack: p.unitsPerPack ?? 1,
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
      purchase?.importState &&
      (purchase.importState.matchKey !== row.key &&
          (!selection.purchaseId ||
            purchase.productUrl !==
              aliProductUrl(row.item.product_url)))
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
    if (component && selection.componentDraft && !automatic)
      throw new AliImportError(
        "Черновик предназначен только для нового компонента",
      );
    if (!component) {
      const name =
        selection.componentDraft?.data.name ??
        selection.name ??
        clean(row.item.title)?.slice(0, 200);
      if (!name) throw new AliImportError("Укажите название нового компонента");
      const id = stableId("component", row.id);
      if (next.items.some((item) => item.id === id))
        throw new AliImportError(
          "Компонент уже импортирован. Выберите существующую покупку.",
        );
      const draft = selection.componentDraft;
      const draftSourceOrder = `ali-source-${row.id}`;
      if (draft?.logistics) {
        const patch = {
          ...draft.logistics,
          orders: draft.logistics.orders.filter(
            (o) => o.id !== draftSourceOrder,
          ),
        };
        for (const collection of [
          patch.orders,
          patch.projects ?? [],
          patch.shipments,
        ]) {
          for (const incoming of collection) {
            const existing = [
              ...next.orders,
              ...next.projects,
              ...next.shipments,
            ].find((entry) => entry.id === incoming.id);
            if (
              existing &&
              JSON.stringify(existing) !== JSON.stringify(incoming)
            )
              throw new AliConflictError(
                "Заказ или проект изменился. Откройте форму заново.",
              );
          }
        }
        const merged = mergeLogistics(next, patch);
        next.orders = merged.orders;
        next.projects = merged.projects;
        next.shipments = merged.shipments;
      }
      component = {
        id,
        data: draft
          ? componentDataSchema.parse({
              ...draft.data,
              purchases: (draft.data.purchases ?? []).filter(
                (p) => p.id !== draftSourceOrder,
              ),
            })
          : componentDataSchema.parse({
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
    const draftOrder = selection.componentDraft?.logistics?.orders.find(
      (o) => o.id === `ali-source-${row.id}`,
    );
    if (draftOrder && isNewComponent) {
      if (draftOrder.number !== row.order.order_id)
        rememberOrderCaption(orderResult.order, draftOrder.number, data.exported_at);
      if (draftOrder.url && draftOrder.url !== row.order.order_url)
        orderResult.order.url = draftOrder.url;
      orderResult.order.comments = [
        ...orderResult.order.comments,
        ...draftOrder.comments.filter(
          (c) => !orderResult.order.comments.some((p) => p.id === c.id),
        ),
      ];
      orderResult.order.trackingNumbers = [
        ...new Set([
          ...orderResult.order.trackingNumbers,
          ...draftOrder.trackingNumbers,
        ]),
      ];
    }
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
    result.purchase.orderId = orderResult.order.id;
    for (const warning of result.warnings) warnings.add(warning);
    if (row.ambiguous)
      warnings.add(
        "Повторяющиеся и неполные позиции нужно сопоставлять вручную при каждой загрузке.",
      );
    if (row.order.tracking_lookup === "cached")
      warnings.add("Трекинг из кэша не обновляет сохранённые треки.");
    const oldOrder = catalog.orders.find((o) => o.id === orderResult.order.id);
    const details = describeChanges(isNewPurchase ? undefined : previous, result.purchase, oldOrder, orderResult.order);
    if (!isNewPurchase && !previous.importState)
      details.push(
        `Связать существующую покупку с заказом ${row.order.order_id}`,
      );
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
      orderNumber: row.order.order_id,
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
      before: catalog.items.find((item) => item.id === component!.id),
      after: structuredClone(component),
      fields: [
        ...(isNewPurchase || previous.quantity !== result.purchase.quantity
          ? [
              {
                label: "Количество покупки",
                before: isNewPurchase ? "—" : String(previous.quantity ?? "?"),
                after: String(result.purchase.quantity ?? "?"),
              },
            ]
          : []),
        ...(isNewPurchase || previous.status !== result.purchase.status
          ? [
              {
                label: "Статус покупки",
                before: isNewPurchase ? "—" : PURCHASE_LABELS[previous.status],
                after: PURCHASE_LABELS[result.purchase.status],
              },
            ]
          : []),
        ...(JSON.stringify(oldOrder?.trackingNumbers ?? []) !==
        JSON.stringify(orderResult.order.trackingNumbers)
          ? [
              {
                label: "Трек-номер",
                before: oldOrder?.trackingNumbers.join(", ") || "—",
                after: orderResult.order.trackingNumbers.join(", ") || "—",
              },
            ]
          : []),
      ],
    });
  }
  // Полная проверка связей, количеств и схемы до единственной записи в хранилище.
  const validated = parseCatalog(JSON.parse(JSON.stringify(next)));
  const token = hash({ catalog, data, selections });
  return {
    catalog: validated,
    preview: {
      token,
      changes: changes.map((change) => ({
        ...change,
        after: validated.items.find((item) => item.id === change.componentId)!,
      })),
      warnings: [...warnings],
      created,
      updated,
      unchanged,
    } satisfies AliPreview,
  };
}
