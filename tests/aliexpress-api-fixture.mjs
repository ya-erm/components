// Запускать только с tests/s3-fixture.mjs и тестовым dev-сервером на localhost:3000.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = "http://localhost:3000";
const cookies = new Map();
async function req(path, body, method = "POST") {
  const response = await fetch(base + path, {
    redirect: "manual",
    method: body === undefined ? "GET" : method,
    headers: {
      Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const part = cookie.split(";")[0],
      index = part.indexOf("=");
    cookies.set(part.slice(0, index), part.slice(index + 1));
  }
  return response;
}
const csrf = await (await req("/api/auth/csrf")).json();
const login = await fetch(base + "/api/auth/callback/credentials", {
  method: "POST",
  redirect: "manual",
  headers: {
    Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({
    csrfToken: csrf.csrfToken,
    login: "demo",
    password: "demo12345",
    callbackUrl: base + "/components",
  }),
});
for (const cookie of login.headers.getSetCookie()) {
  const part = cookie.split(";")[0],
    i = part.indexOf("=");
  cookies.set(part.slice(0, i), part.slice(i + 1));
}
assert.equal(
  (await (await req("/api/auth/session")).json()).user.id,
  "fixture-demo",
);
const fixture = await fetch("http://127.0.0.1:19000/__fixture/catalog");
assert.equal(fixture.status, 200);
const runId = Date.now();
const data = {
  schema_version: 1,
  exported_at: "2026-10-14T12:00:00.000Z",
  orders: [
    {
      order_id: `fixture-ali-${runId}`,
      status: "Awaiting delivery",
      date: "Oct 13, 2026",
      tracking_numbers: ["ALI-TEST-TRACK"],
      tracking_lookup: "ok",
      items: [
        {
          title: "Fixture Ali board",
          product_url: "https://www.aliexpress.com/item/112233.html",
          quantity: 2,
          sku: "S3",
        },
      ],
    },
  ],
};
async function ali(action, selections, token, source = data, expected = 200) {
  const response = await req("/api/components/aliexpress", {
    action,
    data: source,
    selections,
    token,
  });
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
const initial = await (await req("/api/components/export")).json();
const rows = await ali("analyze");
assert.equal(rows.rows.length, 1);
assert.deepEqual(
  (await (await req("/api/components/export")).json()).components,
  initial.components,
);
await ali("preview", [], undefined, data, 400);
const selections = [{ rowId: rows.rows[0].id, unitsPerPack: 10 }];
const preview = await ali("preview", selections);
assert.equal(preview.created, 1);
assert.deepEqual(
  (await (await req("/api/components/export")).json()).components,
  initial.components,
);
const saved = await ali("apply", selections, preview.token);
assert.equal(saved.created, 1);
const again = await ali("preview", selections);
assert.equal(again.created, 0);
assert.equal(again.updated, 0);
assert.equal(again.unchanged, 1);
await ali("apply", selections, again.token);
const exported = await (await req("/api/components/export")).json();
const component = exported.components.find(
  (c) => c.id === saved.changes[0].componentId,
);
assert.equal(component.data.purchases.length, 1);
assert.equal(component.data.purchases[0].quantity, 20);
// Изменение после предпросмотра должно возвращать 409 без перезаписи каталога.
const stale = await ali("preview", selections);
const edit = await req(
  `/api/components/${component.id}`,
  { data: { ...component.data, note: "Edited after preview" } },
  "PUT",
);
assert.equal(edit.status, 200);
await ali("apply", selections, stale.token, data, 409);
assert.equal(
  (await (await req(`/api/components/${component.id}`)).json()).data.note,
  "Edited after preview",
);
// Новая выгрузка обновляет прежнюю покупку и сохраняет правки.
const newer = structuredClone(data);
newer.exported_at = "2026-10-21T12:00:00.000Z";
newer.orders[0].status = "Completed";
const updated = await ali("preview", selections, undefined, newer);
await ali("apply", selections, updated.token, newer);
const final = await (await req(`/api/components/${component.id}`)).json();
assert.equal(final.data.purchases[0].status, "delivered");
assert.equal(final.data.purchases[0].quantity, 20);
assert.equal(final.data.note, "Edited after preview");
// Экспорт/обычный импорт каталога сохраняют привязку.
const backup = await (await req("/api/components/export")).json();
assert.equal((await req("/api/components/import", backup)).status, 200);
assert.equal(
  (await ali("analyze", undefined, undefined, newer)).rows[0].binding
    .componentId,
  component.id,
);
// Проверяем реальное условие записи хранилища, а не только токен API.
const key = `http://127.0.0.1:19000/components-test/conditional-test-${runId}.json`;
assert.equal(
  (
    await fetch(key, {
      method: "PUT",
      headers: { "If-None-Match": "*" },
      body: "{}",
    })
  ).status,
  200,
);
const oldEtag = (await fetch(key)).headers.get("etag");
await fetch(key, { method: "PUT", body: '{"changed":true}' });
assert.equal(
  (
    await fetch(key, {
      method: "PUT",
      headers: { "If-Match": oldEtag },
      body: "{}",
    })
  ).status,
  412,
);
// Старые исключения читаются только при явном восстановлении резервной копии.
const oldBackup = structuredClone(backup);
oldBackup.ignoredAliItems = [{ orderId: data.orders[0].order_id, itemKey: "old-key", title: "old title" }];
const oldOrder = oldBackup.orders.find((order) => order.number === data.orders[0].order_id);
oldOrder.aliexpress = { exportedAt: newer.exported_at, status: "Completed", total: "$12" };
delete oldOrder.importState;
assert.equal((await req("/api/components/import", oldBackup)).status, 200);
const migrated = await (await req("/api/components/export")).json();
assert.equal("ignoredAliItems" in migrated, false);
assert.equal("aliexpress" in migrated.orders.find((order) => order.id === oldOrder.id), false);
assert.equal(migrated.orders.find((order) => order.id === oldOrder.id).totalText, "$12");
assert.deepEqual(migrated.legacyIgnoredOrders, [{ source: "AliExpress", id: data.orders[0].order_id }]);
// Новый API не записывает предпочтения скрытия. Мост очищается идемпотентно через CAS.
assert.equal((await req("/api/components/aliexpress", { action: "hide", data })).status, 400);
const behaviorUrl = "http://127.0.0.1:19000/__fixture/write-behavior";
await fetch(behaviorUrl, {
  method: "POST",
  body: JSON.stringify({ delayMs: 100 }),
});
try {
  const responses = await Promise.all([1, 2].map(() =>
    req("/api/components/aliexpress", {
      action: "ackImportPreferences", data, preferences: migrated.legacyIgnoredOrders,
    }),
  ));
  for (const response of responses) assert.equal(response.status, 200);
  const afterConcurrent = await ali("analyze");
  assert.equal(afterConcurrent.legacyIgnoredOrders, undefined);
  const repeat = await req("/api/components/aliexpress", {
    action: "ackImportPreferences", data, preferences: migrated.legacyIgnoredOrders,
  });
  assert.equal(repeat.status, 200);
  assert.equal((await repeat.json()).legacyIgnoredOrders, undefined);
} finally {
  await fetch(behaviorUrl, { method: "POST", body: "{}" });
}

// Уже существующая покупка находится через обычные номер и источник заказа.
const existingData = structuredClone(data);
existingData.orders[0].order_id = `existing-number-${runId}`;
const existingOrderId = `existing-order-${runId}`;
const existingPurchaseId = `existing-purchase-${runId}`;
const manualCreated = await req("/api/components", {
  data: {
    name: "Existing board by order number",
    purchases: [{ id: existingPurchaseId, orderId: existingOrderId, quantity: 2, status: "in_transit" }],
  },
  logistics: {
    orders: [{ id: existingOrderId, number: existingData.orders[0].order_id, source: "AliExpress" }],
    shipments: [],
  },
});
assert.equal(manualCreated.status, 201);
const manualPart = await manualCreated.json();
const byNumber = await ali("analyze", undefined, undefined, existingData);
assert.equal(byNumber.rows[0].binding.componentId, manualPart.id);
const byNumberChoices = [{ rowId: byNumber.rows[0].id, unitsPerPack: 1 }];
const byNumberPreview = await ali("preview", byNumberChoices, undefined, existingData);
assert.equal(byNumberPreview.created, 0);
await ali("apply", byNumberChoices, byNumberPreview.token, existingData);
const savedByNumber = await (await req(`/api/components/${manualPart.id}`)).json();
assert.equal(savedByNumber.data.purchases.length, 1);
assert.equal(savedByNumber.data.purchases[0].id, existingPurchaseId);
assert.equal("aliexpress" in savedByNumber.data.purchases[0], false);
const numberBackup = await (await req("/api/components/export")).json();
const ownOrder = numberBackup.orders.find((order) => order.id === existingOrderId);
assert.equal(ownOrder.number, existingData.orders[0].order_id);
assert.equal("aliexpress" in ownOrder, false);
assert.equal((await req("/api/components/import", numberBackup)).status, 200);
assert.equal((await ali("preview", byNumberChoices, undefined, existingData)).unchanged, 1);

// Воспроизводимый браузерный сценарий: связанная карточка с изменениями и новый товар.
const uiFixture = await req("/api/components/import", {
  components: [{ id: "ui-component", data: {
    name: "Моя плата ESP32", tags: ["ESP", "Робот"], type: "Плата/МК", note: "Ящик 2",
    purchases: [{ id: "ui-buy", orderId: "ui-order", quantity: 2, status: "in_transit",
      productUrl: "https://www.aliexpress.com/item/6677.html", variant: "S3", unitsPerPack: 1,
      importState: { exportedAt: "2026-10-20T12:00:00.000Z", matchKey: JSON.stringify(["https://www.aliexpress.com/item/6677.html", "s3"]), lastQuantity: 2, lastStatus: "in_transit", manualFields: [] },
    }],
  } }],
  orders: [{ id: "ui-order", number: "ui-order", source: "AliExpress", trackingNumbers: ["UI-TRACK-1"], importState: { exportedAt: "2026-10-20T12:00:00.000Z" } }], shipments: [],
});
assert.equal(uiFixture.status, 200);

// Необязательная живая проверка CDN → сервер → тестовый S3.
if (process.env.IMPORT_TEST_IMAGE_FILE) {
  const imageSource = JSON.parse(await readFile(process.env.IMPORT_TEST_IMAGE_FILE, "utf8"));
  const imageUrl = imageSource.orders.flatMap((order) => order.items).find((item) => item.image_url)?.image_url;
  assert.ok(imageUrl);
  const withImage = structuredClone(data);
  withImage.orders[0].order_id = `fixture-image-${runId}`;
  withImage.orders[0].items[0].image_url = imageUrl;
  const imageRows = await ali("analyze", undefined, undefined, withImage);
  const imageChoice = [{ rowId: imageRows.rows[0].id, unitsPerPack: 1 }];
  const imagePreview = await ali("preview", imageChoice, undefined, withImage);
  assert.deepEqual(imagePreview.changes[0].after.data.images, [imageUrl]);
  const imageApplied = await ali("apply", imageChoice, imagePreview.token, withImage);
  const ownImage = imageApplied.changes[0].after.data.images[0];
  assert.ok(ownImage.startsWith("http://127.0.0.1:19000/components-test/public/images/fixture-demo/"));
  const uploadedResponse = await fetch(ownImage);
  assert.equal(uploadedResponse.status, 200);
  assert.ok((await uploadedResponse.arrayBuffer()).byteLength > 0);
  const imageReplay = await ali("preview", imageChoice, undefined, withImage);
  await ali("apply", imageChoice, imageReplay.token, withImage);
  assert.deepEqual(imageReplay.changes[0].after.data.images, [ownImage]);
  console.log("Image copy: preview keeps source URL; confirmed new component uses S3; replay reuses the saved photo.");
}

console.log(
  "Import API: analysis, apply, replay, delivery update, stale preview 409, backup migration, S3 conditional writes and concurrent migration acknowledgment passed.",
);
