// Запуск: node tests/api-fixture.mjs при активных dev-сервере и s3-fixture.mjs.
// Записи выполняются только после подтверждения тестового пользователя и каталога.
import assert from "node:assert/strict";
const base = "http://localhost:3000";
const cookies = new Map();
async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    redirect: "manual",
    headers: {
      Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      ...options.headers,
    },
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0],
      separator = pair.indexOf("=");
    cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return response;
}
const read = async (path) => {
  const response = await request(path);
  assert.equal(response.status, 200);
  return response.json();
};
const write = (path, body, method = "POST") =>
  request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const csrf = await read("/api/auth/csrf");
await request("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    csrfToken: csrf.csrfToken,
    login: "demo",
    password: "demo12345",
    callbackUrl: base + "/components",
  }).toString(),
});
assert.equal((await read("/api/auth/session")).user.id, "fixture-demo");
const original = await read("/api/components/export");
assert.ok(
  original.components.some((component) => component.id === "legacy-led"),
);

const orderId = crypto.randomUUID(),
  projectId = crypto.randomUUID();
const name = `QA ${Date.now()}`;
const response = await write("/api/components", {
  data: {
    name: name + " ESP32",
    purchases: [
      { id: "delivered", orderId, status: "delivered", quantity: 5 },
      { id: "transit", orderId, status: "in_transit", quantity: 2 },
      { id: "planned", orderId, status: "planned", quantity: 3 },
      { id: "cancelled", orderId, status: "cancelled", quantity: 8 },
    ],
    usages: [{ id: "usage", projectId, quantity: 2 }],
  },
  logistics: {
    orders: [
      { id: orderId, number: name, trackingNumbers: ["TRACK-A", "TRACK-B"] },
    ],
    projects: [{ id: projectId, name: name + " Робот" }],
  },
});
assert.equal(response.status, 201);
const first = await response.json();
assert.equal(first.data.purchases.length, 4);
const response2 = await write("/api/components", {
  data: {
    name: name + " Драйвер",
    purchases: [{ id: "delivery", orderId, status: "delivered", quantity: 4 }],
    usages: [{ id: "usage", projectId, quantity: 1 }],
  },
});
assert.equal(response2.status, 201);
const second = await response2.json();
let exported = await read("/api/components/export");
assert.equal(
  exported.projects.filter((project) => project.id === projectId).length,
  1,
);
assert.equal(exported.orders.filter((order) => order.id === orderId).length, 1);
assert.equal(
  exported.components.filter((component) =>
    component.data.usages?.some((usage) => usage.projectId === projectId),
  ).length,
  2,
);

for (const status of ["in_stock", "in_transit", "planned", "used"])
  assert.ok(
    (await read(`/api/components?status=${status}&all=1`)).items.some(
      (item) => item.id === first.id,
    ),
  );
assert.ok(
  (
    await read(`/api/components?q=${encodeURIComponent(name + " Робот")}&all=1`)
  ).items.some((item) => item.id === second.id),
);
assert.ok(
  (await read("/api/components?q=TRACK-A&all=1")).items.some(
    (item) => item.id === first.id,
  ),
);
const order = exported.orders.find((order) => order.id === orderId);
const comment = {
  id: crypto.randomUUID(),
  text: "Общий комментарий к заказу",
  createdAt: new Date().toISOString(),
};
assert.equal(
  (
    await write(
      `/api/components/${first.id}`,
      {
        data: first.data,
        logistics: { orders: [{ ...order, comments: [comment] }] },
      },
      "PUT",
    )
  ).status,
  200,
);
for (const data of [
  { ...first.data, usages: [{ id: "usage", projectId, quantity: 6 }] },
  {
    ...first.data,
    usages: [{ id: "usage", projectId: "missing", quantity: 1 }],
  },
  {
    ...first.data,
    purchases: [{ id: "purchase", orderId, quantity: -1, status: "delivered" }],
  },
  {
    ...first.data,
    purchases: first.data.purchases.map((purchase) => ({
      ...purchase,
      status: "planned",
    })),
  },
])
  assert.equal(
    (await write(`/api/components/${first.id}`, { data }, "PUT")).status,
    400,
  );
exported = await read("/api/components/export");
for (let iteration = 0; iteration < 2; iteration++) {
  const response = await write("/api/components/import", exported);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).created, 0);
}
const restored = await read("/api/components/export");
assert.deepEqual(restored.components, exported.components);
assert.deepEqual(restored.orders, exported.orders);
assert.deepEqual(restored.projects, exported.projects);
const legacy = await write("/api/components/import", {
  version: 1,
  components: [
    {
      id: crypto.randomUUID(),
      data: { name: name + " Старый формат", quantity: 7, status: "in_stock" },
    },
  ],
});
assert.equal(legacy.status, 200);
assert.equal((await legacy.json()).created, 1);
console.log(
  "API fixture passed: orders, shared projects, statuses, stock limits, search, comments, round trip and legacy import.",
);
