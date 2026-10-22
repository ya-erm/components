import assert from "node:assert/strict";
import { test } from "node:test";
import {
  componentDataSchema,
  hasInventoryStatus,
  inventoryTotals,
  moveInventory,
} from "../lib/schema";
import { parseCatalog, mergeLogistics, validateCatalog } from "../lib/catalog";

test("legacy quantities and notes migrate without inventing stock", () => {
  const stock = componentDataSchema.parse({
    name: "ESP32",
    quantity: 5,
    status: "in_stock",
    note: "Ящик 1",
  });
  assert.equal(stock.inventory[0].quantity, 5);
  assert.equal(stock.note, "Ящик 1");
  assert.equal(hasInventoryStatus(stock, "in_stock"), true);
  const uncertain = componentDataSchema.parse({
    name: "LED",
    quantity: 8,
    status: "out_of_stock",
  });
  assert.equal(uncertain.inventory[0].status, "unassigned");
  assert.equal(uncertain.inventory[0].quantity, 8);
  assert.equal(hasInventoryStatus(uncertain, "out_of_stock"), false);
  const transit = componentDataSchema.parse({
    name: "ESP32",
    quantity: 0,
    status: "in_transit",
  });
  assert.equal(transit.inventory[0].quantity, undefined);
  assert.equal(hasInventoryStatus(transit, "in_transit"), true);
});

test("partial receipt and project usage conserve quantities and provenance", () => {
  const initial = componentDataSchema.parse({
    name: "DRV8833",
    inventory: [
      {
        id: "first",
        status: "in_transit",
        quantity: 5,
        orderId: "order",
        shipmentId: "parcel",
      },
    ],
  });
  const received = { ...initial, ...moveInventory(initial, "first", 2) };
  assert.equal(hasInventoryStatus(received, "in_stock"), true);
  assert.equal(hasInventoryStatus(received, "in_transit"), true);
  const stock = received.inventory.find(
    (entry) => entry.status === "in_stock",
  )!;
  const used = {
    ...received,
    ...moveInventory(received, stock.id, 1, "Машинка"),
  };
  assert.deepEqual(
    inventoryTotals(used).map((total) => total.quantity),
    [1, 3, 1, 0],
  );
  assert.equal(
    used.inventory.find((entry) => entry.status === "used")?.project,
    "Машинка",
  );
  assert.equal(used.history.length, 2);
  assert.equal(used.history[1].shipmentId, "parcel");
  assert.equal(initial.inventory[0].quantity, 5);
  for (const count of [0, -1, 6, 1.5, NaN])
    assert.throws(() => moveInventory(initial, "first", count));
});

test("unknown stock is distinct from zero and empty stock is derived", () => {
  assert.equal(
    hasInventoryStatus(
      componentDataSchema.parse({ name: "LED", inventory: [] }),
      "out_of_stock",
    ),
    true,
  );
  const unknown = componentDataSchema.parse({
    name: "LED",
    inventory: [{ id: "stock", status: "in_stock" }],
  });
  assert.equal(hasInventoryStatus(unknown, "out_of_stock"), false);
  assert.equal(inventoryTotals(unknown)[0].unknown, true);
  assert.throws(() => moveInventory(unknown, "stock", 1));
});

test("a transfer preserves unrelated zero-quantity entries", () => {
  const initial = componentDataSchema.parse({
    name: "LED",
    inventory: [
      { id: "transit", status: "in_transit", quantity: 2 },
      { id: "empty", status: "in_stock", quantity: 0 },
    ],
  });
  const result = moveInventory(initial, "transit", 2);
  assert.ok(result.inventory.some((entry) => entry.id === "empty"));
  assert.equal(
    result.inventory.some((entry) => entry.id === "transit"),
    false,
  );
});

test("shared parcel supports multiple orders and survives export round trip", () => {
  const makeItem = (id: string, orderId: string) => ({
    id,
    data: componentDataSchema.parse({
      name: id,
      inventory: [
        {
          id: "entry",
          status: "in_transit",
          quantity: 1,
          orderId,
          shipmentId: "shared",
        },
      ],
    }),
    createdAt: "2026-10-13",
    updatedAt: "2026-10-13",
  });
  const catalog = parseCatalog({
    version: 2,
    items: [makeItem("A", "one"), makeItem("B", "two")],
    orders: [
      {
        id: "one",
        number: "1",
        source: "AliExpress",
        comments: [
          {
            id: "comment",
            text: "Проверить плату",
            createdAt: "2026-10-13T12:00:00.000Z",
          },
        ],
      },
      { id: "two", number: "2", source: "AliExpress" },
    ],
    shipments: [{ id: "shared", trackingNumber: "UT991689162NL" }],
  });
  const restored = parseCatalog(JSON.parse(JSON.stringify(catalog)));
  assert.deepEqual(restored, catalog);
  const changed = mergeLogistics(catalog, {
    orders: [{ ...catalog.orders[0], store: "Продавец" }],
    shipments: [],
  });
  assert.equal(changed.orders.length, 2);
  assert.equal(changed.orders[1].number, "2");
  assert.equal(changed.shipments.length, 1);
  assert.throws(() =>
    validateCatalog({
      ...catalog,
      shipments: [
        ...catalog.shipments,
        { id: "duplicate", trackingNumber: "ut991689162nl" },
      ],
    }),
  );
  assert.throws(() => validateCatalog({ ...catalog, orders: [] }));
  assert.throws(() => validateCatalog({ ...catalog, shipments: [] }));
});

test("old catalog array normalizes and invalid quantities are rejected", () => {
  const legacy = parseCatalog([
    {
      id: "old",
      data: { name: "LED", status: "in_stock", quantity: 10 },
      createdAt: "2026-10-13",
      updatedAt: "2026-10-13",
    },
  ]);
  assert.equal(legacy.version, 2);
  assert.equal(legacy.items[0].data.inventory[0].quantity, 10);
  for (const quantity of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(
      componentDataSchema.safeParse({
        name: "LED",
        inventory: [{ id: "row", status: "in_stock", quantity }],
      }).success,
      false,
    );
  }
  assert.equal(
    componentDataSchema.safeParse({
      name: "LED",
      inventory: [
        { id: "same", status: "in_stock" },
        { id: "same", status: "used" },
      ],
    }).success,
    false,
  );
});

test("legacy stock becomes delivered orders and usage shares projects across components", () => {
  const makeItem = (id: string) => ({
    id,
    data: {
      name: id,
      inventory: [
        { id: "stock", status: "in_stock", quantity: 5 },
        { id: "transit", status: "in_transit", quantity: 3 },
        { id: "used", status: "used", quantity: 2, project: "Машинка" },
      ],
    },
    createdAt: "2026-10-13",
    updatedAt: "2026-10-13",
  });
  const catalog = parseCatalog([makeItem("ESP32"), makeItem("DRV8833")]);
  assert.equal(catalog.projects.length, 1);
  assert.equal(
    catalog.items[0].data.usages?.[0].projectId,
    catalog.items[1].data.usages?.[0].projectId,
  );
  assert.equal(
    catalog.items[0].data.purchases?.find(
      (entry) => entry.status === "delivered",
    )?.quantity,
    7,
  );
  assert.equal(
    inventoryTotals(catalog.items[0].data).find(
      (entry) => entry.status === "in_stock",
    )?.quantity,
    5,
  );
  assert.equal(
    inventoryTotals(catalog.items[0].data).find(
      (entry) => entry.status === "used",
    )?.quantity,
    2,
  );
  assert.equal(catalog.items[0].data.inventory[2].project, "Машинка");
  assert.deepEqual(parseCatalog(JSON.parse(JSON.stringify(catalog))), catalog);
});

test("planned orders do not create stock and project usage cannot exceed deliveries", () => {
  const raw = {
    version: 2,
    orders: [
      { id: "order", number: "Заказ", trackingNumbers: ["TRACK-A", "TRACK-B"] },
    ],
    projects: [{ id: "project", name: "Машинка" }],
    items: [
      {
        id: "part",
        data: {
          name: "ESP32",
          purchases: [
            {
              id: "purchase",
              orderId: "order",
              quantity: 10,
              status: "planned",
            },
          ],
          usages: [],
        },
        createdAt: "2026-10-13",
        updatedAt: "2026-10-13",
      },
    ],
  };
  const planned = parseCatalog(raw);
  assert.equal(hasInventoryStatus(planned.items[0].data, "planned"), true);
  assert.equal(hasInventoryStatus(planned.items[0].data, "in_stock"), false);
  const cancelled = parseCatalog({
    ...raw,
    items: [
      {
        ...raw.items[0],
        data: {
          ...raw.items[0].data,
          purchases: [
            { ...raw.items[0].data.purchases[0], status: "cancelled" },
          ],
        },
      },
    ],
  });
  assert.equal(hasInventoryStatus(cancelled.items[0].data, "in_stock"), false);
  assert.equal(hasInventoryStatus(cancelled.items[0].data, "planned"), false);
  assert.equal(cancelled.items[0].data.purchases?.[0].quantity, 10);
  const data = {
    ...planned.items[0].data,
    purchases: [
      { ...planned.items[0].data.purchases![0], status: "delivered" as const },
    ],
    usages: [{ id: "usage", projectId: "project", quantity: 4 }],
  };
  const delivered = { ...planned, items: [{ ...planned.items[0], data }] };
  validateCatalog(delivered);
  assert.equal(
    inventoryTotals(data).find((entry) => entry.status === "in_stock")
      ?.quantity,
    6,
  );
  assert.throws(
    () =>
      validateCatalog({
        ...delivered,
        items: [
          {
            ...delivered.items[0],
            data: {
              ...data,
              usages: [{ id: "usage", projectId: "project", quantity: 11 }],
            },
          },
        ],
      }),
    /больше, чем доставлено/,
  );
  assert.throws(
    () => validateCatalog({ ...delivered, projects: [] }),
    /проект/,
  );
  assert.throws(
    () =>
      parseCatalog({
        ...raw,
        items: [
          {
            ...raw.items[0],
            data: {
              name: "ESP32",
              usages: [{ id: "usage", projectId: "project", quantity: 1 }],
            },
          },
        ],
      }),
    /больше, чем доставлено/,
  );
  assert.deepEqual(delivered.orders[0].trackingNumbers, ["TRACK-A", "TRACK-B"]);
});

test("legacy shipment tracks migrate without restoring deliberately removed tracks", () => {
  const catalog = parseCatalog({
    version: 2,
    orders: [{ id: "order", number: "AliExpress" }],
    shipments: [
      {
        id: "parcel",
        trackingNumber: "TRACK-A",
        carrier: "Carrier",
        status: "Delivered",
      },
    ],
    items: [
      {
        id: "part",
        data: {
          name: "ESP32",
          inventory: [
            {
              id: "stock",
              status: "in_stock",
              quantity: 2,
              orderId: "order",
              shipmentId: "parcel",
            },
          ],
        },
        createdAt: "2026-10-13",
        updatedAt: "2026-10-13",
      },
    ],
  });
  assert.deepEqual(catalog.orders[0].trackingNumbers, ["TRACK-A"]);
  assert.equal(catalog.shipments[0].carrier, "Carrier");
  const edited = {
    ...catalog,
    orders: [{ ...catalog.orders[0], trackingNumbers: [] }],
  };
  assert.deepEqual(
    parseCatalog(JSON.parse(JSON.stringify(edited))).orders[0].trackingNumbers,
    [],
  );
});
