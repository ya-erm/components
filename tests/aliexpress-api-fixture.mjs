// Запускать только с tests/s3-fixture.mjs и тестовым dev-сервером на localhost:3000.
import assert from "node:assert/strict";

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
// Скрытие сохраняется в каталоге и резервной копии; восстановление возвращает товар.
const hiddenResponse = await req("/api/components/aliexpress", {
  action: "hide",
  data,
  rowIds: [rows.rows[0].id],
});
assert.equal(hiddenResponse.status, 200);
assert.equal((await hiddenResponse.json()).rows[0].ignored, true);
assert.equal((await ali("analyze")).rows[0].ignored, true);
await ali("preview", selections, undefined, data, 400);
const hiddenBackup = await (await req("/api/components/export")).json();
assert.ok(
  hiddenBackup.ignoredAliItems.some(
    (item) => item.orderId === data.orders[0].order_id,
  ),
);
assert.equal((await req("/api/components/import", hiddenBackup)).status, 200);
assert.equal((await ali("analyze")).rows[0].ignored, true);
const restoreResponse = await req("/api/components/aliexpress", {
  action: "restore",
  data,
  rowIds: [rows.rows[0].id],
});
assert.equal(restoreResponse.status, 200);
assert.equal((await restoreResponse.json()).rows[0].ignored, false);

console.log(
  "AliExpress API: analyze/preview are read-only; apply, exact replay, delivery update, stale preview 409, backup round trip and S3 conditional write passed.",
);
