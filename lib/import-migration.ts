/** Совместимость прежних каталогов и локальных черновиков. Новые записи — без aliexpress. */
const record = (value: unknown): Record<string, any> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any> : undefined;

export function migrateOrderImport(value: unknown): unknown {
  const order = record(value), legacy = record(order?.aliexpress);
  if (!order || !legacy) return value;
  const { aliexpress: _, ...fields } = order;
  const number = legacy.orderId ?? order.number;
  const comments = Array.isArray(order.comments) ? [...order.comments] : [];
  if (number !== order.number) {
    let id = "legacy-order-number";
    while (comments.some((comment) => comment.id === id)) id += "-1";
    comments.push({ id, text: `Прежнее название заказа: ${order.number}`, createdAt: legacy.exportedAt });
  }
  return {
    ...fields, number, source: legacy.orderId ? "AliExpress" : order.source,
    comments,
    date: order.date ?? legacy.date,
    sourceStatus: order.sourceStatus ?? legacy.status,
    totalText: order.totalText ?? legacy.total,
    trackingDetails: order.trackingDetails ?? legacy.shipments,
    importState: order.importState ?? { exportedAt: legacy.exportedAt },
  };
}

export function migratePurchaseImport(value: unknown): unknown {
  const purchase = record(value), legacy = record(purchase?.aliexpress);
  if (!purchase || !legacy) return value;
  const { aliexpress: _, ...fields } = purchase;
  return {
    ...fields,
    productUrl: purchase.productUrl ?? legacy.productUrl,
    variant: purchase.variant ?? legacy.sku,
    unitsPerPack: purchase.unitsPerPack ?? legacy.unitsPerPack,
    importState: purchase.importState ?? {
      exportedAt: legacy.exportedAt,
      matchKey: legacy.itemKey,
      needsManualMatch: legacy.ambiguous,
      lastQuantity: legacy.lastQuantity,
      lastStatus: legacy.lastStatus,
      manualFields: [
        ...(legacy.quantityOverride ? ["quantity"] : []),
        ...(legacy.statusOverride ? ["status"] : []),
      ],
    },
  };
}

/** Временный мост: только номера, пока браузер не подтвердит их локальное сохранение. */
export function migrateIgnoredOrders(value: unknown) {
  const catalog = record(value);
  if (!catalog || !Array.isArray(catalog.ignoredAliItems)) return value;
  const { ignoredAliItems, ...fields } = catalog;
  const entries = [
    ...(catalog.legacyIgnoredOrders ?? []),
    ...ignoredAliItems.map((item: any) => ({ source: "AliExpress", id: item.orderId })),
  ];
  return { ...fields, legacyIgnoredOrders: [...new Map(entries.map((entry) => [
    JSON.stringify([entry.source.toLowerCase(), entry.id]), entry,
  ])).values()] };
}

/** Отдельная миграция S3/старой резервной копии; обычное чтение её не вызывает. */
export function migrateCatalogImport(value: unknown): unknown {
  value = structuredClone(value);
  if (Array.isArray(value)) return value.map((item) => migrateComponent(item));
  const catalog = record(migrateIgnoredOrders(value));
  if (!catalog) return value;
  const orders = Array.isArray(catalog.orders) ? catalog.orders.map(migrateOrderImport) : undefined;
  const aliases = new Map<string, string>();
  if (orders) {
    const groups = new Map<string, any[]>();
    for (const order of orders) {
      const item = record(order);
      if (!item || typeof item.source !== "string" || typeof item.number !== "string") continue;
      const key = JSON.stringify([item.source.toLowerCase(), item.number.toLowerCase()]);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    for (const group of groups.values()) {
      if (group.length < 2 || !group.some((order) => catalog.orders.some((old: any) => old.id === order.id && old.aliexpress))) continue;
      const target = group.find((order) => !catalog.orders.some((old: any) => old.id === order.id && old.aliexpress)) ?? group[0];
      for (const order of group) {
        if (order === target) continue;
        aliases.set(order.id, target.id);
        target.trackingNumbers = [...new Set([...(target.trackingNumbers ?? []), ...(order.trackingNumbers ?? [])])];
        target.comments ??= [];
        for (const comment of order.comments ?? []) {
          if (target.comments.some((value: any) => JSON.stringify(value) === JSON.stringify(comment))) continue;
          let id = comment.id;
          while (target.comments.some((value: any) => value.id === id)) id += "-1";
          target.comments.push({ ...comment, id });
        }
        for (const [key, field] of Object.entries(order)) target[key] ??= field;
        target.trackingDetails = [...new Map([
          ...(order.trackingDetails ?? []), ...(target.trackingDetails ?? []),
        ].map((shipment) => [shipment.trackingNumber.toLowerCase(), shipment])).values()];
      }
    }
  }
  const migrateEntry = (entry: unknown) => {
    const item = record(migrateComponent(entry));
    if (!item || !aliases.size) return item ?? entry;
    const data = record(item.data) ?? item;
    for (const key of ["purchases", "inventory", "history"]) {
      if (Array.isArray(data[key])) data[key] = data[key].map((purchase: any) => ({
        ...purchase, ...(aliases.has(purchase.orderId) ? { orderId: aliases.get(purchase.orderId) } : {}),
      }));
    }
    return item;
  };
  return {
    ...catalog,
    ...(orders ? { orders: orders.filter((order) => !aliases.has(record(order)?.id)) } : {}),
    ...(Array.isArray(catalog.items) ? { items: catalog.items.map(migrateEntry) } : {}),
    ...(Array.isArray(catalog.components) ? { components: catalog.components.map(migrateEntry) } : {}),
  };
}

function migrateComponent(value: unknown): unknown {
  const item = record(value);
  if (!item) return value;
  const data = record(item.data) ?? item;
  const migrated = { ...data, ...(Array.isArray(data.purchases)
    ? { purchases: data.purchases.map(migratePurchaseImport) } : {}) };
  return item.data ? { ...item, data: migrated } : migrated;
}
