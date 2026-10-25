import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  getProjectComponentsVersion,
  orderProjectComponents,
} from "../lib/project-components";
import { parseCatalog, mergeLogistics } from "../lib/catalog";
import {
  logisticsSchema,
  projectSchema,
  componentDataSchema,
} from "../lib/schema";

const raw = () => ({
  version: 2,
  projects: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
  orders: [
    {
      id: "order",
      number: "Order",
      source: "test",
      comments: [],
      trackingNumbers: [],
    },
  ],
  items: [
    {
      id: "one",
      data: {
        name: "One",
        purchases: [
          { id: "p", orderId: "order", quantity: 10, status: "delivered" },
        ],
        usages: [
          { id: "u1", projectId: "a", quantity: 2 },
          { id: "u2", projectId: "a", quantity: 1 },
          { id: "u3", projectId: "b", quantity: 1 },
        ],
      },
      createdAt: "now",
      updatedAt: "now",
    },
    {
      id: "two",
      data: {
        name: "Two",
        purchases: [
          { id: "p", orderId: "order", quantity: 5, status: "delivered" },
        ],
        usages: [],
      },
      createdAt: "now",
      updatedAt: "now",
    },
    {
      id: "unknown",
      data: {
        name: "Unknown",
        purchases: [{ id: "p", orderId: "order", status: "delivered" }],
        usages: [
          { id: "u4", projectId: "a", quantity: 4 },
          { id: "u5", projectId: "a" },
        ],
      },
      createdAt: "now",
      updatedAt: "now",
    },
  ],
});

test("project ordering metadata survives export, old forms and detail edits", () => {
  const catalog = parseCatalog(raw());
  catalog.projects[0].componentOrder = ["unknown", "one"];
  const parsed = parseCatalog(JSON.parse(JSON.stringify(catalog)));
  assert.deepEqual(parsed.projects[0].componentOrder, ["unknown", "one"]);
  const oldForm = logisticsSchema.parse({
    projects: [
      { id: "a", name: "Renamed", componentOrder: ["one", "unknown"] },
    ],
  });
  assert.deepEqual(mergeLogistics(parsed, oldForm).projects[0].componentOrder, [
    "unknown",
    "one",
  ]);
  assert.equal(
    projectSchema.safeParse({ id: "x", name: "X", componentOrder: ["a", "a"] })
      .success,
    false,
  );
  assert.deepEqual(
    orderProjectComponents(
      [{ id: "one" }, { id: "two" }, { id: "unknown" }],
      ["unknown", "one"],
    ).map((item) => item.id),
    ["unknown", "one", "two"],
  );
});

test("project mutations are scoped, atomic, inventory-safe, persistent and conflict-aware", async (t) => {
  const objects = new Map([
    ["/mutation-test/users/owner/catalog.json", JSON.stringify(raw())],
    ["/mutation-test/users/other/catalog.json", JSON.stringify(raw())],
  ]);
  const key = "/mutation-test/users/owner/catalog.json";
  let injectConflict = false;
  let missingEtag = false;
  let concurrentOrder = false;
  const etag = (value: string | undefined) =>
    value ? `"${createHash("md5").update(value).digest("hex")}"` : undefined;
  const server = createServer(async (request, response) => {
    const objectKey = decodeURIComponent(
      new URL(request.url!, "http://localhost").pathname,
    );
    if (request.method === "PUT") {
      if (injectConflict) {
        injectConflict = false;
        const latest = JSON.parse(objects.get(key)!);
        latest.items[0].data.note = "Concurrent note";
        objects.set(key, JSON.stringify(latest));
      }
      if (concurrentOrder) {
        concurrentOrder = false;
        const latest = JSON.parse(objects.get(key)!);
        latest.projects.reverse();
        latest.projects.find(
          (project: { id: string }) => project.id === "a",
        ).componentOrder = ["one"];
        latest.items.find(
          (item: { id: string }) => item.id === "two",
        ).data.usages = [{ id: "parallel", projectId: "b", quantity: 1 }];
        objects.set(key, JSON.stringify(latest));
      }
      if (request.headers["if-match"] !== etag(objects.get(objectKey))) {
        response.writeHead(412, { "Content-Type": "application/xml" });
        response.end("<Error><Code>PreconditionFailed</Code></Error>");
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      objects.set(objectKey, Buffer.concat(chunks).toString());
      response.end();
    } else if (objects.has(objectKey)) {
      response.setHeader("Content-Type", "application/json");
      if (!missingEtag)
        response.setHeader("ETag", etag(objects.get(objectKey))!);
      response.end(objects.get(objectKey));
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  Object.assign(process.env, {
    S3_ENDPOINT: `http://127.0.0.1:${address.port}`,
    S3_BUCKET: "mutation-test",
    S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "test",
    S3_FORCE_PATH_STYLE: "true",
  });
  const {
    reorderProjects,
    reorderProjectComponents,
    saveProjectComponents,
    projectComponentsSchema,
    projectOrderSchema,
  } = await import("../lib/project-mutations");
  const {
    saveProject,
    createComponent,
    updateComponent,
    deleteComponent,
    importComponents,
  } = await import("../lib/components-repo");
  const read = () => parseCatalog(JSON.parse(objects.get(key)!));
  const other = objects.get("/mutation-test/users/other/catalog.json");
  await reorderProjects("owner", ["b", "a"]);
  assert.deepEqual(
    read().projects.map((project) => project.id),
    ["b", "a"],
  );
  await assert.rejects(reorderProjects("owner", ["a"]), /Список изменился/);
  await assert.rejects(
    reorderProjects("owner", ["a", "a"]),
    /Список изменился/,
  );
  await assert.rejects(
    reorderProjectComponents("owner", "missing", []),
    /Проект не найден/,
  );
  await reorderProjectComponents("owner", "a", ["unknown", "one"]);
  assert.deepEqual(
    read().projects.find((project) => project.id === "a")!.componentOrder,
    ["unknown", "one"],
  );
  await assert.rejects(
    reorderProjectComponents("owner", "a", ["two", "one"]),
    /Список изменился/,
  );
  await saveProject("owner", { id: "a", name: "Renamed" }, false);
  assert.deepEqual(
    read().projects.find((project) => project.id === "a")!.componentOrder,
    ["unknown", "one"],
  );
  const initial = read();
  const expected = getProjectComponentsVersion(initial.items, "a");
  injectConflict = true;
  const saved = await saveProjectComponents("owner", "a", {
    expected,
    components: [
      { id: "one", quantity: 3 },
      { id: "unknown" },
      { id: "two", quantity: 2 },
    ],
  });
  assert.deepEqual(read().items[0].data.usages, initial.items[0].data.usages);
  assert.deepEqual(read().items[2].data.usages, initial.items[2].data.usages);
  assert.equal(read().items[0].data.note, "Concurrent note");
  assert.equal(read().items[1].data.usages![0].quantity, 2);
  assert.deepEqual(saved.project.componentOrder, ["unknown", "one", "two"]);
  const beforeInvalid = objects.get(key);
  await assert.rejects(
    saveProjectComponents("owner", "a", { expected, components: [] }),
    /изменились/,
  );
  await assert.rejects(
    saveProjectComponents("owner", "a", {
      expected: saved.version,
      components: [{ id: "two", quantity: 6 }],
    }),
    /больше, чем доставлено/,
  );
  await assert.rejects(
    saveProjectComponents("owner", "a", {
      expected: saved.version,
      components: [{ id: "foreign" }],
    }),
    /не найден/,
  );
  assert.equal(objects.get(key), beforeInvalid);
  const removed = await saveProjectComponents("owner", "a", {
    expected: saved.version,
    components: [{ id: "one", quantity: 4 }],
  });
  assert.equal(
    removed.components[0].data.usages!.filter(
      (usage) => usage.projectId === "a",
    ).length,
    1,
  );
  assert.deepEqual(
    removed.components[0].data.usages!.find((usage) => usage.projectId === "b"),
    { id: "u3", projectId: "b", quantity: 1 },
  );
  assert.deepEqual(removed.project.componentOrder, ["one"]);
  assert.deepEqual(
    read().items.map((item) => item.data.purchases),
    initial.items.map((item) => item.data.purchases),
  );
  assert.equal(objects.get("/mutation-test/users/other/catalog.json"), other);
  // Simulate an older whole-catalog writer reaching S3 after a project save.
  // Every legacy path must retry its narrow mutation against the newest order/usage.
  const assertConcurrentPreserved = (previousOrder: string[]) => {
    assert.deepEqual(
      read().projects.map((project) => project.id),
      [...previousOrder].reverse(),
    );
    assert.deepEqual(
      read().projects.find((project) => project.id === "a")!.componentOrder,
      ["one"],
    );
    assert.deepEqual(
      read().items.find((item) => item.id === "two")!.data.usages,
      [{ id: "parallel", projectId: "b", quantity: 1 }],
    );
  };
  let previousOrder = read().projects.map((project) => project.id);
  concurrentOrder = true;
  const created = await createComponent(
    "owner",
    componentDataSchema.parse({ name: "New", purchases: [], usages: [] }),
  );
  assertConcurrentPreserved(previousOrder);
  previousOrder = read().projects.map((project) => project.id);
  concurrentOrder = true;
  await updateComponent("owner", created.id, {
    ...created.data,
    name: "Updated",
  });
  assertConcurrentPreserved(previousOrder);
  previousOrder = read().projects.map((project) => project.id);
  concurrentOrder = true;
  await importComponents("owner", [
    { id: created.id, data: { ...created.data, name: "Imported" } },
  ]);
  assertConcurrentPreserved(previousOrder);
  previousOrder = read().projects.map((project) => project.id);
  concurrentOrder = true;
  await deleteComponent("owner", created.id);
  assertConcurrentPreserved(previousOrder);
  const backupProjects = [...read().projects]
    .reverse()
    .map((project) => ({ ...project, componentOrder: [] }));
  const beforeRestore = read().items;
  await importComponents(
    "owner",
    [],
    logisticsSchema.parse({ projects: backupProjects }),
  );
  assert.deepEqual(read().projects, backupProjects);
  assert.deepEqual(read().items, beforeRestore);
  // A later ordinary component form cannot revert the explicitly restored order.
  await updateComponent(
    "owner",
    "one",
    read().items.find((item) => item.id === "one")!.data,
    logisticsSchema.parse({
      projects: backupProjects.map((project) => ({
        ...project,
        componentOrder: ["one"],
      })),
    }),
  );
  assert.deepEqual(read().projects, backupProjects);
  missingEtag = true;
  await assert.rejects(reorderProjects("owner", ["a", "b"]), /версию каталога/);
  assert.equal(
    projectComponentsSchema.safeParse({
      expected: "",
      components: [{ id: "x", quantity: -1 }],
    }).success,
    false,
  );
  assert.equal(
    projectComponentsSchema.safeParse({
      expected: "",
      components: [{ id: "x" }, { id: "x" }],
    }).success,
    false,
  );
  assert.equal(
    projectOrderSchema.safeParse({ ids: ["x", "x"] }).success,
    false,
  );
});
