import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aliExportSchema,
  analyzeAli,
  planAliImport,
  type AliSelection,
} from "../lib/aliexpress";
import { parseCatalog } from "../lib/catalog";
import { inventoryTotals, componentDataSchema } from "../lib/schema";
import { migrateCatalogImport } from "../lib/import-migration";
import { readImportPreferences, setOrderIgnored, isOrderIgnored, migrateImportPreferences } from "../lib/import-preferences";

function source() {
  return aliExportSchema.parse({
    schema_version: 1,
    exported_at: "2026-10-13T12:00:00.000Z",
    orders: [
      {
        order_id: "fresh",
        date: "Oct 12, 2026",
        status: "Awaiting delivery",
        store: "Boards",
        total_text: "$10",
        order_url:
          "https://www.aliexpress.com/p/order/detail.html?orderId=fresh",
        tracking_numbers: ["TRACK-1"],
        tracking_lookup: "ok",
        items_complete: true,
        items: [
          {
            title: "ESP32",
            product_url: "https://www.aliexpress.com/item/123.html?ref=1",
            sku: "S3",
            quantity: 2,
          },
          {
            title: "LED",
            product_url: "https://www.aliexpress.com/item/456.html",
            sku: "Red",
            quantity: 3,
          },
        ],
      },
      {
        order_id: "old",
        date: "Sep 1, 2026",
        status: "Completed",
        items: [
          {
            title: "Resistor",
            product_url: "https://www.aliexpress.com/item/789.html",
            sku: "10K",
            quantity: 10,
          },
        ],
      },
    ],
  });
}
const empty = () => parseCatalog(null);
function firstSelection(data = source(), catalog = empty()): AliSelection {
  return { rowId: analyzeAli(catalog, data).rows[0].id, unitsPerPack: 10 };
}

test("order matching uses the domain order number and does not store duplicate external numbers", () => {
  const data = source();
  const saved = planAliImport(empty(), data, [firstSelection(data)]).catalog;
  assert.equal(saved.orders[0].number, "fresh");
  assert.equal(saved.orders[0].source, "AliExpress");
  assert.equal("aliexpress" in saved.orders[0], false);
  assert.equal("aliexpress" in saved.items[0].data.purchases![0], false);
  // Служебные id не обязаны кодировать внешний номер.
  saved.orders[0].number = "another-number";
  data.orders[0].order_id = "another-number";
  const restored = parseCatalog(JSON.parse(JSON.stringify(saved)));
  const row = analyzeAli(restored, data).rows.find((row) => row.orderId === "another-number")!;
  assert.equal(row.binding?.purchaseId, saved.items[0].data.purchases![0].id);
  const repeated = planAliImport(restored, data, [{ rowId: row.id, unitsPerPack: 10 }]);
  assert.equal(repeated.catalog.items.length, 1);
  assert.equal(repeated.catalog.orders.length, 1);
  assert.equal(repeated.catalog.items[0].data.purchases!.length, 1);
});

test("an unambiguous existing purchase matches by its order number without import metadata", () => {
  const data = source();
  data.orders[0].items = [data.orders[0].items[0]];
  const catalog = parseCatalog({
    version: 2,
    orders: [{ id: "own-order", source: "AliExpress", number: "fresh" }],
    items: [{ id: "own-part", data: {
      name: "Моя плата", purchases: [{ id: "own-purchase", orderId: "own-order", quantity: 8, status: "delivered" }],
    }, createdAt: data.exported_at, updatedAt: data.exported_at }],
  });
  const row = analyzeAli(catalog, data).rows[0];
  assert.equal(row.binding?.componentId, "own-part");
  const result = planAliImport(catalog, data, [{ rowId: row.id, unitsPerPack: 1 }]);
  assert.equal(result.catalog.items.length, 1);
  assert.equal(result.catalog.orders.length, 1);
  assert.equal(result.catalog.items[0].data.purchases!.length, 1);
  assert.equal(result.catalog.items[0].data.purchases![0].quantity, 8);
  assert.equal(result.catalog.items[0].data.purchases![0].status, "delivered");
  assert.equal(planAliImport(result.catalog, data, [{ rowId: row.id, unitsPerPack: 1 }]).preview.unchanged, 1);
  const multi = source();
  assert.equal(analyzeAli(catalog, multi).rows[0].binding, undefined);
  catalog.orders[0].source = "Other shop";
  assert.equal(analyzeAli(catalog, data).rows[0].binding, undefined);
});

test("legacy bindings are readable and move their number to the domain order on apply", () => {
  const data = source();
  const saved = planAliImport(empty(), data, [firstSelection(data)]).catalog;
  const legacy = JSON.parse(JSON.stringify(saved));
  legacy.orders[0].number = "Старое название";
  legacy.orders[0].source = "Вручную";
  const purchase = legacy.items[0].data.purchases[0];
  legacy.orders[0].aliexpress = { orderId: "fresh", exportedAt: data.exported_at, date: "Oct 12, 2026", status: "Awaiting delivery", total: "$10" };
  delete legacy.orders[0].importState;
  purchase.aliexpress = { orderId: "fresh", itemKey: purchase.importState.matchKey, exportedAt: data.exported_at, unitsPerPack: 10, lastQuantity: 20, lastStatus: "in_transit", productUrl: purchase.productUrl, sku: "S3" };
  delete purchase.importState;
  const restored = parseCatalog(migrateCatalogImport(legacy));
  assert.ok(analyzeAli(restored, data).rows[0].binding);
  const result = planAliImport(restored, data, [firstSelection(data, restored)]).catalog;
  assert.equal(result.orders[0].number, "fresh");
  assert.equal(result.orders[0].source, "AliExpress");
  assert.ok(result.orders[0].comments.some((comment) => comment.text.includes("Старое название")));
  assert.equal("aliexpress" in result.orders[0], false);
  assert.equal("aliexpress" in result.items[0].data.purchases![0], false);
  assert.equal(result.items[0].data.purchases![0].variant, "S3");
  assert.deepEqual(parseCatalog(migrateCatalogImport(result)), result);
  assert.equal(planAliImport(result, data, [firstSelection(data, result)]).preview.unchanged, 1);
});

test("explicit linking reuses the matching order and rejects a purchase from another AliExpress order", () => {
  const data = source();
  const catalog = parseCatalog({
    version: 2,
    orders: [
      { id: "ali-order", source: "AliExpress", number: "fresh" },
      { id: "manual-order", number: "Моя покупка" },
    ],
    items: [{ id: "own-part", data: {
      name: "Моя плата", purchases: [{ id: "own-purchase", orderId: "manual-order", quantity: 8, status: "delivered" }],
    }, createdAt: data.exported_at, updatedAt: data.exported_at }],
  });
  const choice = { ...firstSelection(data, catalog), componentId: "own-part", purchaseId: "own-purchase" };
  const result = planAliImport(catalog, data, [choice]).catalog;
  assert.equal(result.orders.length, 2);
  assert.equal(result.items[0].data.purchases![0].orderId, "ali-order");
  assert.equal(result.items[0].data.purchases![0].quantity, 8);
  catalog.orders[1].source = "AliExpress";
  catalog.orders[1].number = "different-order";
  assert.throws(() => planAliImport(catalog, data, [choice]), /другим заказом/);
});

test("individual goods can be applied sequentially to one component without touching the rest", () => {
  const data = source();
  const rows = analyzeAli(empty(), data).rows;
  const first = planAliImport(empty(), data, [{ rowId: rows[0].id, unitsPerPack: 1 }]);
  assert.equal(first.catalog.items.length, 1);
  const componentId = first.catalog.items[0].id;
  assert.equal(first.catalog.items[0].data.purchases?.length, 1);
  const nextChoice = [{ rowId: rows[1].id, componentId, unitsPerPack: 1 }];
  const second = planAliImport(first.catalog, data, nextChoice);
  assert.equal(second.catalog.items.length, 1);
  assert.equal(second.catalog.items[0].data.purchases?.length, 2);
  const bindings = analyzeAli(second.catalog, data).rows;
  assert.equal(bindings[0].binding?.componentId, componentId);
  assert.equal(bindings[1].binding?.componentId, componentId);
  assert.equal(bindings[2].binding, undefined);
  assert.equal(planAliImport(second.catalog, data, nextChoice).preview.unchanged, 1);
});

test("full component draft preserves metadata, images, comments, purchases and project usage", () => {
  const data = source();
  const selection = firstSelection(data);
  const sourceId = `ali-source-${selection.rowId}`;
  selection.componentDraft = {
    data: componentDataSchema.parse({
      name: "Контроллер",
      type: "Плата/МК",
      tags: ["робот", "ESP"],
      note: "Ящик 2",
      images: ["https://ae-pic-a1.aliexpress-media.com/test.jpg"],
      url: "https://example.com/board",
      comments: [
        {
          id: "comment",
          text: "Проверить питание",
          createdAt: data.exported_at,
        },
      ],
      purchases: [
        { id: sourceId, orderId: sourceId, quantity: 20, status: "in_transit" },
        {
          id: "manual",
          orderId: "manual-order",
          quantity: 5,
          status: "delivered",
        },
      ],
      usages: [{ id: "usage", projectId: "robot", quantity: 2 }],
    }),
    logistics: {
      orders: [
        {
          id: sourceId,
          number: "Платы Ali",
          source: "AliExpress",
          comments: [],
          trackingNumbers: ["TRACK-1"],
        },
        {
          id: "manual-order",
          number: "Магазин",
          source: "Вручную",
          comments: [],
          trackingNumbers: [],
        },
      ],
      shipments: [],
      projects: [{ id: "robot", name: "Робот" }],
    },
  };
  const result = planAliImport(empty(), data, [selection]);
  const part = result.catalog.items[0];
  assert.equal(part.data.name, "Контроллер");
  assert.equal(part.data.type, "Плата/МК");
  assert.deepEqual(part.data.tags, ["робот", "ESP"]);
  assert.equal(part.data.note, "Ящик 2");
  assert.equal(part.data.comments[0].text, "Проверить питание");
  assert.equal(part.data.images.length, 1);
  assert.equal(part.data.purchases!.length, 2);
  assert.equal(
    part.data.purchases!.some((p) => p.id === sourceId),
    false,
  );
  assert.equal(inventoryTotals(part.data)[0].quantity, 3);
  assert.equal(result.preview.changes[0].after.data.tags[0], "робот");
  assert.equal(result.preview.changes[0].fields[0].after, "20");
  assert.deepEqual(
    planAliImport(result.catalog, data, [selection]).catalog,
    result.catalog,
  );
  assert.equal(
    analyzeAli(result.catalog, data).components[0].data.name,
    "Контроллер",
  );
});

test("browser exclusions use only source and order IDs and survive repeats without re-hiding restored orders", () => {
  const initial = readImportPreferences(null);
  const refs = [{ source: "AliExpress", id: "fresh" }, { source: "Other shop", id: "fresh" }];
  const migrated = migrateImportPreferences(initial, refs);
  const restored = setOrderIgnored(migrated, "AliExpress", "fresh", false);
  const again = migrateImportPreferences(readImportPreferences(JSON.stringify(restored)), refs);
  assert.equal(isOrderIgnored(again, "AliExpress", "fresh"), false);
  assert.equal(isOrderIgnored(again, "Other shop", "fresh"), true);
  assert.equal(isOrderIgnored(initial, "AliExpress", "fresh"), false);
  assert.deepEqual(again.ignoredOrders, { aliexpress: [], "other shop": ["fresh"] });
  assert.throws(() => readImportPreferences('{"version":1,"ignoredOrders":{"a":[null]},"migratedSources":[]}'));
});

test("old exclusion details collapse to a temporary migration bridge with order IDs only", () => {
  const catalog = parseCatalog(migrateCatalogImport({ version: 2, items: [], ignoredAliItems: [
    { orderId: "fresh", itemKey: "a", title: "private title" },
    { orderId: "fresh", itemKey: "b" },
  ] }));
  assert.deepEqual(catalog.legacyIgnoredOrders, [{ source: "AliExpress", id: "fresh" }]);
  assert.equal("ignoredAliItems" in catalog, false);
});

test("preview cards show final quantities when several selected goods share a component", () => {
  const data = source();
  const catalog = parseCatalog([
    {
      id: "part",
      data: { name: "Общий компонент", purchases: [] },
      createdAt: data.exported_at,
      updatedAt: data.exported_at,
    },
  ]);
  const rows = analyzeAli(catalog, data).rows.filter(
    (row) => row.orderId === "fresh",
  );
  const result = planAliImport(
    catalog,
    data,
    rows.map((row) => ({
      rowId: row.id,
      componentId: "part",
      unitsPerPack: 1,
    })),
  );
  assert.equal(result.catalog.items[0].data.purchases!.length, 2);
  assert.ok(
    result.preview.changes.every(
      (change) => change.after.data.purchases!.length === 2,
    ),
  );
  assert.ok(
    result.preview.changes.every((change) => change.orderNumber === "fresh"),
  );
});

test("selective import creates only chosen purchase, and repeated import is an exact no-op", () => {
  const data = source(),
    initial = empty(),
    selection = firstSelection();
  const rows = analyzeAli(initial, data).rows;
  assert.equal(rows[0].orderId, "fresh");
  assert.equal(rows[0].dateSort, "2026-10-12");
  const first = planAliImport(initial, data, [selection]);
  assert.equal(initial.items.length, 0);
  assert.equal(first.catalog.items.length, 1);
  assert.equal(first.catalog.orders.length, 1);
  assert.equal(first.catalog.items[0].data.purchases![0].quantity, 20);
  assert.equal(first.preview.created, 1);
  assert.equal(analyzeAli(first.catalog, data).rows[0].kind, "unchanged");
  const again = planAliImport(first.catalog, data, [selection]);
  assert.deepEqual(again.catalog, first.catalog);
  assert.equal(again.preview.created, 0);
  assert.equal(again.preview.updated, 0);
  assert.equal(again.preview.unchanged, 1);
  assert.deepEqual(
    parseCatalog(JSON.parse(JSON.stringify(first.catalog))),
    first.catalog,
  );
});

test("newer export updates delivery and stock, reorder and query parameters preserve identity", () => {
  const data = source();
  const first = planAliImport(empty(), data, [firstSelection()]).catalog;
  const newer = source();
  newer.exported_at = "2026-10-20T12:00:00.000Z";
  newer.orders[0].status = "Completed";
  newer.orders[0].tracking_numbers.push("TRACK-2");
  newer.orders[0].items.reverse();
  newer.orders[0].items[1].product_url =
    "https://www.aliexpress.com/item/123.html?ref=other";
  const row = analyzeAli(first, newer).rows.find((r) => r.title === "ESP32")!;
  assert.equal(row.kind, "changed");
  assert.equal(row.binding!.componentId, first.items[0].id);
  assert.ok(row.changes.includes("Статус: В пути → Доставлено"));
  assert.ok(row.changes.includes("Треки: TRACK-1 → TRACK-1, TRACK-2"));
  const result = planAliImport(first, newer, [
    { rowId: row.id, unitsPerPack: row.binding!.unitsPerPack },
  ]);
  assert.equal(result.catalog.items.length, 1);
  assert.equal(result.catalog.items[0].data.purchases!.length, 1);
  assert.equal(result.catalog.items[0].data.purchases![0].status, "delivered");
  assert.equal(inventoryTotals(result.catalog.items[0].data)[0].quantity, 20);
  assert.deepEqual(result.catalog.orders[0].trackingNumbers, [
    "TRACK-1",
    "TRACK-2",
  ]);
});

test("manual data, package conversion and project usage survive automatic updates", () => {
  const data = source();
  data.orders[0].status = "Completed";
  const catalog = planAliImport(empty(), data, [firstSelection(data)]).catalog;
  const part = catalog.items[0];
  part.data.name = "Моя плата";
  part.data.note = "Ящик 3";
  part.data.tags = ["MCU"];
  part.data.purchases![0].quantity = 17;
  part.data.purchases![0].status = "cancelled";
  catalog.orders[0].comments.push({
    id: "c",
    text: "Проверить",
    createdAt: data.exported_at,
  });
  const newer = source();
  newer.exported_at = "2026-10-20T12:00:00.000Z";
  newer.orders[0].status = "Completed";
  newer.orders[0].items[0].quantity = 3;
  const result = planAliImport(catalog, newer, [
    firstSelection(newer, catalog),
  ]);
  assert.equal(result.catalog.items[0].data.purchases![0].quantity, 17);
  assert.equal(result.catalog.items[0].data.purchases![0].status, "cancelled");
  assert.equal(result.catalog.items[0].data.name, "Моя плата");
  assert.equal(result.catalog.items[0].data.note, "Ящик 3");
  assert.deepEqual(result.catalog.items[0].data.tags, ["MCU"]);
  assert.equal(result.catalog.orders[0].comments[0].text, "Проверить");
  assert.ok(result.preview.warnings.some((w) => w.includes("вручную")));
  assert.ok(analyzeAli(catalog, newer).rows[0].changes.every((text) => !text.startsWith("Количество:") && !text.startsWith("Статус:")));
});

test("migration merges legacy order aliases without losing purchases, comments or tracking", () => {
  const raw = {
    version: 2,
    orders: [
      { id: "canonical", number: "fresh", source: "AliExpress", comments: [{ id: "c", text: "Keep", createdAt: source().exported_at }], trackingNumbers: ["A"] },
      { id: "alias", number: "My order", source: "Manual", comments: [{ id: "c", text: "Also keep", createdAt: source().exported_at }], trackingNumbers: ["B"], aliexpress: {
        orderId: "fresh", exportedAt: source().exported_at, total: "$20", shipments: [{ trackingNumber: "B", carrier: "Post" }],
      } },
      { id: "other", number: "fresh", source: "Other shop" },
    ],
    items: [{ id: "part", createdAt: source().exported_at, updatedAt: source().exported_at,
      data: { name: "Board", purchases: [{ id: "buy", orderId: "alias", quantity: 7, status: "cancelled", aliexpress: {
        itemKey: "key", exportedAt: source().exported_at, unitsPerPack: 10, lastQuantity: 20, lastStatus: "in_transit", quantityOverride: true, statusOverride: true,
      } }] } }],
  };
  const original = structuredClone(raw);
  const migrated = parseCatalog(migrateCatalogImport(raw));
  assert.deepEqual(raw, original);
  assert.equal(migrated.orders.length, 2);
  assert.equal(migrated.items[0].data.purchases![0].orderId, "canonical");
  assert.deepEqual(migrated.items[0].data.purchases![0].importState?.manualFields, ["quantity", "status"]);
  assert.equal(migrated.orders[0].comments.length, 3);
  assert.deepEqual(migrated.orders[0].trackingNumbers, ["A", "B"]);
  assert.equal(migrated.orders[0].trackingDetails?.[0].carrier, "Post");
  assert.deepEqual(parseCatalog(migrateCatalogImport(migrated)), migrated);
  assert.equal(JSON.stringify(migrated).includes('"aliexpress":'), false);
});

test("import migration preserves project descriptions, photos and usage links from the current schema", () => {
  const raw = {
    version: 2, orders: [{ id: "order", number: "manual" }],
    projects: [{ id: "robot", name: "Robot", description: "# Assembly notes", images: ["https://example.com/second.jpg", "https://example.com/first.jpg"] }],
    items: [{ id: "part", createdAt: "", updatedAt: "", data: {
      name: "Board", purchases: [{ id: "buy", orderId: "order", quantity: 2, status: "delivered" }],
      usages: [{ id: "usage", projectId: "robot", quantity: 1 }],
    } }],
  };
  const migrated = parseCatalog(migrateCatalogImport(raw));
  assert.deepEqual(migrated.projects, raw.projects);
  assert.deepEqual(migrated.items[0].data.usages, raw.items[0].data.usages);
});

test("old exports, missing values, cached tracking, unknown and regressive statuses do not damage saved data", () => {
  const data = source();
  data.orders[0].status = "Completed";
  const catalog = planAliImport(empty(), data, [firstSelection(data)]).catalog;
  const older = source();
  older.exported_at = "2026-10-01T12:00:00.000Z";
  older.orders[0].items[0].quantity = 99;
  older.orders[0].tracking_numbers = ["STALE"];
  const preserved = planAliImport(catalog, older, [
    firstSelection(older, catalog),
  ]).catalog;
  assert.deepEqual(preserved, catalog);
  const cached = source();
  cached.exported_at = "2026-10-20T12:00:00.000Z";
  cached.orders[0].tracking_lookup = "cached";
  cached.orders[0].tracking_numbers = ["CACHE"];
  cached.orders[0].items[0].quantity = null;
  const result = planAliImport(catalog, cached, [
    firstSelection(cached, catalog),
  ]).catalog;
  assert.equal(result.items[0].data.purchases![0].status, "delivered");
  assert.equal(result.items[0].data.purchases![0].quantity, 20);
  assert.deepEqual(result.orders[0].trackingNumbers, ["TRACK-1"]);
  cached.orders[0].status = "Some new status";
  assert.equal(
    planAliImport(catalog, cached, [firstSelection(cached, catalog)]).catalog
      .items[0].data.purchases![0].status,
    "delivered",
  );
});

test("existing component accepts another order and manual purchase can be linked without double stock", () => {
  const data = source();
  const catalog = parseCatalog({
    version: 2,
    orders: [{ id: "manual-order", number: "Покупка ESP" }],
    items: [
      {
        id: "manual-part",
        data: {
          name: "Мой ESP32",
          purchases: [
            {
              id: "manual-buy",
              orderId: "manual-order",
              quantity: 8,
              status: "delivered",
            },
          ],
        },
        createdAt: data.exported_at,
        updatedAt: data.exported_at,
      },
    ],
  });
  const result = planAliImport(catalog, data, [
    {
      ...firstSelection(data, catalog),
      componentId: "manual-part",
      purchaseId: "manual-buy",
    },
  ]);
  assert.equal(result.catalog.items.length, 1);
  assert.equal(result.catalog.orders.length, 1);
  assert.equal(result.catalog.items[0].data.purchases!.length, 1);
  assert.equal(result.catalog.items[0].data.purchases![0].quantity, 8);
  assert.equal(result.catalog.items[0].data.purchases![0].status, "delivered");
  assert.equal(result.catalog.orders[0].number, "fresh");
  assert.equal(result.catalog.orders[0].source, "AliExpress");
  assert.ok(result.catalog.orders[0].comments.some((comment) => comment.text.includes("Покупка ESP")));
  assert.ok(analyzeAli(result.catalog, data).rows[0].binding);
  const row = analyzeAli(result.catalog, data).rows.find(
    (r) => r.orderId === "old",
  )!;
  const added = planAliImport(result.catalog, data, [
    { rowId: row.id, componentId: "manual-part", unitsPerPack: 1 },
  ]);
  assert.equal(added.catalog.items[0].data.purchases!.length, 2);
  assert.equal(added.catalog.orders.length, 2);
});

test("ambiguous duplicate and incomplete items require manual mapping on subsequent imports", () => {
  const data = source();
  data.orders[0].items.push({ ...data.orders[0].items[0] });
  data.orders[0].items[0].title = null;
  const rows = analyzeAli(empty(), data).rows.filter((r) =>
    r.productUrl?.includes("123"),
  );
  assert.ok(rows.every((r) => r.kind === "review" && !r.binding));
  const result = planAliImport(empty(), data, [
    { rowId: rows[0].id, name: "ESP", unitsPerPack: 1 },
  ]);
  assert.equal(
    analyzeAli(result.catalog, data).rows.find((r) => r.id === rows[0].id)!
      .binding,
    undefined,
  );
  assert.throws(
    () =>
      planAliImport(result.catalog, data, [
        { rowId: rows[0].id, name: "ESP", unitsPerPack: 1 },
      ]),
    /уже импортирован/,
  );
  const part = result.catalog.items[0];
  assert.equal(
    planAliImport(result.catalog, data, [
      {
        rowId: rows[0].id,
        componentId: part.id,
        purchaseId: part.data.purchases![0].id,
        unitsPerPack: 1,
      },
    ]).catalog.items.length,
    1,
  );
});

test("preview token changes with catalog contents and no selection cannot write", () => {
  const catalog = empty(),
    data = source();
  assert.throws(() => planAliImport(catalog, data, []), /Выберите/);
  const first = planAliImport(catalog, data, [firstSelection()]);
  const altered = structuredClone(catalog);
  altered.orders.push({
    id: "other",
    number: "other",
    source: "Вручную",
    comments: [],
    trackingNumbers: [],
  });
  assert.notEqual(
    first.preview.token,
    planAliImport(altered, data, [firstSelection()]).preview.token,
  );
  assert.throws(
    () => planAliImport(catalog, data, [firstSelection(), firstSelection()]),
    /Повторяющиеся/,
  );
});

test("variants stay distinct and restoring export retains bindings", () => {
  const data = source();
  data.orders[0].items[1].product_url = data.orders[0].items[0].product_url;
  const rows = analyzeAli(empty(), data).rows.filter(
    (r) => r.orderId === "fresh",
  );
  assert.notEqual(rows[0].id, rows[1].id);
  const catalog = planAliImport(
    empty(),
    data,
    rows.map((r) => ({ rowId: r.id, unitsPerPack: 1 })),
  ).catalog;
  const restored = parseCatalog(JSON.parse(JSON.stringify(catalog)));
  assert.equal(
    analyzeAli(restored, data).rows.filter((r) => r.binding).length,
    2,
  );
  assert.deepEqual(
    planAliImport(
      restored,
      data,
      rows.map((r) => ({ rowId: r.id, unitsPerPack: 1 })),
    ).catalog,
    restored,
  );
});

test("newer unchanged data stays unchanged; quantity can be explicitly cleared", () => {
  const data = source();
  const catalog = planAliImport(empty(), data, [firstSelection()]).catalog;
  const newer = source();
  newer.exported_at = "2026-10-20T12:00:00.000Z";
  assert.equal(analyzeAli(catalog, newer).rows[0].kind, "unchanged");
  const result = planAliImport(catalog, newer, [
    firstSelection(newer, catalog),
  ]);
  assert.equal(result.preview.updated, 0);
  assert.equal(result.preview.unchanged, 1);
  assert.equal(
    planAliImport(catalog, newer, [
      { ...firstSelection(newer, catalog), quantity: null },
    ]).catalog.items[0].data.purchases![0].quantity,
    undefined,
  );
});

test("manual quantity remains protected even if an intermediate export matches the correction", () => {
  const data = source();
  const initial = planAliImport(empty(), data, [firstSelection()]).catalog;
  initial.items[0].data.purchases![0].quantity = 30;
  const same = source();
  same.exported_at = "2026-10-20T12:00:00.000Z";
  same.orders[0].items[0].quantity = 3;
  const saved = planAliImport(initial, same, [
    firstSelection(same, initial),
  ]).catalog;
  assert.equal(
    saved.items[0].data.purchases![0].importState!.manualFields.includes("quantity"),
    true,
  );
  same.exported_at = "2026-10-21T12:00:00.000Z";
  same.orders[0].items[0].quantity = 4;
  assert.equal(
    planAliImport(saved, same, [firstSelection(same, saved)]).catalog.items[0]
      .data.purchases![0].quantity,
    30,
  );
});

test("import preserves project usage and rejects a manual update that would overdraw stock", () => {
  const data = source();
  data.orders[0].status = "Completed";
  const catalog = planAliImport(empty(), data, [firstSelection(data)]).catalog;
  catalog.projects.push({ id: "robot", name: "Робот" });
  catalog.items[0].data.usages = [
    { id: "usage", projectId: "robot", quantity: 5 },
  ];
  const newer = source();
  newer.exported_at = "2026-10-20T12:00:00.000Z";
  newer.orders[0].status = "Completed";
  const result = planAliImport(catalog, newer, [
    firstSelection(newer, catalog),
  ]);
  assert.deepEqual(
    result.catalog.items[0].data.usages,
    catalog.items[0].data.usages,
  );
  assert.equal(inventoryTotals(result.catalog.items[0].data)[0].quantity, 15);
  assert.throws(
    () =>
      planAliImport(catalog, newer, [
        { ...firstSelection(newer, catalog), quantity: 4 },
      ]),
    /больше, чем доставлено/,
  );
  assert.equal(catalog.items[0].data.purchases![0].quantity, 20);
});

test("completed details can resolve an incomplete item's saved purchase through explicit mapping", () => {
  const data = source();
  data.orders[0].items[0].sku = null;
  data.orders[0].items[0].title = null;
  const row = analyzeAli(empty(), data).rows[0];
  const catalog = planAliImport(empty(), data, [
    { rowId: row.id, name: "ESP", unitsPerPack: 1 },
  ]).catalog;
  const newer = source();
  newer.exported_at = "2026-10-20T12:00:00.000Z";
  const resolved = planAliImport(catalog, newer, [
    {
      rowId: analyzeAli(catalog, newer).rows[0].id,
      componentId: catalog.items[0].id,
      purchaseId: catalog.items[0].data.purchases![0].id,
      unitsPerPack: 1,
    },
  ]);
  assert.equal(resolved.catalog.items.length, 1);
  assert.equal(
    analyzeAli(resolved.catalog, newer).rows[0].binding!.componentId,
    catalog.items[0].id,
  );
});
