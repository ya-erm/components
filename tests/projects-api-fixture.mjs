// Запуск: node tests/projects-api-fixture.mjs при активных dev-сервере и s3-fixture.mjs.
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

const version = (items, projectId) =>
  JSON.stringify(
    items
      .flatMap((item) => {
        const usages = (item.data.usages ?? []).filter(
          (usage) => usage.projectId === projectId,
        );
        return usages.length
          ? [
              {
                id: item.id,
                usages: usages
                  .map(({ id, quantity }) => ({ id, quantity }))
                  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
              },
            ]
          : [];
      })
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  );
const name = `Project API ${Date.now()}`;
const projectResponse = await write("/api/projects", { name });
assert.equal(projectResponse.status, 201);
const project = await projectResponse.json();
const projectPath = `/api/projects/${encodeURIComponent(project.id)}`;
const exported = await read("/api/components/export");
const reversed = exported.projects.map((entry) => entry.id).reverse();
assert.equal(
  (await write("/api/projects/order", { ids: reversed }, "PATCH")).status,
  200,
);
assert.deepEqual(
  (await read("/api/components/export")).projects.map((entry) => entry.id),
  reversed,
);
assert.equal(
  (
    await write(
      "/api/projects/order",
      { ids: [project.id, project.id] },
      "PATCH",
    )
  ).status,
  400,
);
assert.equal(
  (await write("/api/projects/order", { ids: [] }, "PATCH")).status,
  409,
);
let expected = version(exported.components, project.id);
const add = await write(
  `${projectPath}/components`,
  { expected, components: [{ id: "legacy-led", quantity: 1 }] },
  "PUT",
);
assert.equal(add.status, 200);
const added = await add.json();
expected = added.version;
assert.equal(
  added.components
    .find((item) => item.id === "legacy-led")
    .data.usages.find((usage) => usage.projectId === project.id).quantity,
  1,
);
assert.equal(
  (
    await write(
      `${projectPath}/components`,
      { expected: "[]", components: [] },
      "PUT",
    )
  ).status,
  409,
);
assert.equal(
  (
    await write(
      `${projectPath}/components`,
      { expected, components: [{ id: "legacy-led", quantity: 1000 }] },
      "PUT",
    )
  ).status,
  400,
);
assert.equal(
  (
    await write(
      `${projectPath}/components`,
      { expected, components: [{ id: "other-owners-component" }] },
      "PUT",
    )
  ).status,
  400,
);
assert.equal(
  (await write(`${projectPath}/order`, { ids: ["legacy-led"] }, "PUT")).status,
  200,
);
assert.equal(
  (await write(`${projectPath}/order`, { ids: [] }, "PUT")).status,
  409,
);
assert.equal(
  (await write(`${projectPath}`, { name: `${name} renamed` }, "PUT")).status,
  200,
);
let latest = await read("/api/components/export");
assert.deepEqual(
  latest.projects.find((entry) => entry.id === project.id).componentOrder,
  ["legacy-led"],
);
const backup = latest;
assert.equal(
  (
    await write(
      `${projectPath}/components`,
      { expected, components: [] },
      "PUT",
    )
  ).status,
  200,
);
latest = await read("/api/components/export");
assert.equal(
  latest.components
    .find((item) => item.id === "legacy-led")
    .data.usages.some((usage) => usage.projectId === project.id),
  false,
);
assert.deepEqual(
  latest.projects.find((entry) => entry.id === project.id).componentOrder,
  [],
);
assert.equal(
  (
    await write(
      "/api/projects/order",
      { ids: latest.projects.map((entry) => entry.id).reverse() },
      "PATCH",
    )
  ).status,
  200,
);
assert.equal((await write("/api/components/import", backup)).status, 200);
const restored = await read("/api/components/export");
assert.deepEqual(restored.projects, backup.projects);
assert.deepEqual(
  restored.components.map((item) => item.data.usages),
  backup.components.map((item) => item.data.usages),
);

assert.equal(
  (
    await request(`${projectPath}/components`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{",
    })
  ).status,
  400,
);
assert.equal(
  (
    await write(
      `${projectPath}/components`,
      {
        expected: "[]",
        components: [{ id: "legacy-led" }, { id: "legacy-led" }],
      },
      "PUT",
    )
  ).status,
  400,
);
const savedOwnerCatalog = await read("/api/components/export");
const login = `project-fixture-${Date.now()}`;
assert.equal(
  (await write("/api/register", { login, password: "fixture-only-123" }))
    .status,
  201,
);
cookies.clear();
const secondCsrf = await read("/api/auth/csrf");
await request("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    csrfToken: secondCsrf.csrfToken,
    login,
    password: "fixture-only-123",
    callbackUrl: base + "/components",
  }).toString(),
});
assert.notEqual((await read("/api/auth/session")).user.id, "fixture-demo");
assert.equal(
  (
    await write(
      `${projectPath}/components`,
      { expected: "[]", components: [] },
      "PUT",
    )
  ).status,
  404,
);
assert.equal(
  (await write(`${projectPath}/order`, { ids: ["legacy-led"] }, "PUT")).status,
  404,
);
assert.equal(
  (await write("/api/projects/order", { ids: [project.id] }, "PATCH")).status,
  409,
);
const ownProjectResponse = await write("/api/projects", {
  name: `${name} other owner`,
});
assert.equal(ownProjectResponse.status, 201);
const ownProject = await ownProjectResponse.json();
assert.equal(
  (
    await write(
      `/api/projects/${ownProject.id}/components`,
      { expected: "[]", components: [{ id: "legacy-led" }] },
      "PUT",
    )
  ).status,
  400,
);
cookies.clear();
const returnCsrf = await read("/api/auth/csrf");
await request("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    csrfToken: returnCsrf.csrfToken,
    login: "demo",
    password: "demo12345",
    callbackUrl: base + "/components",
  }).toString(),
});
const unchanged = await read("/api/components/export");
assert.deepEqual(unchanged.components, savedOwnerCatalog.components);
assert.deepEqual(unchanged.projects, savedOwnerCatalog.projects);
const unauthenticated = await fetch(base + `${projectPath}/components`, {
  method: "PUT",
  redirect: "manual",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ expected: "[]", components: [] }),
});
assert.ok([401, 307].includes(unauthenticated.status));
console.log(
  "Project API fixture passed: project order, selection/quantity, persistence, stale conflict, stock validation, owner scope and unauthenticated write rejection.",
);
