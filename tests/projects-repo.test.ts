import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { projectSchema } from "../lib/schema";

test("project saves preserve stock, usage links, and other owners' catalogs", async (t) => {
  const catalog = {
    version: 2,
    projects: [{ id: "robot", name: "Робот" }],
    orders: [
      {
        id: "order",
        number: "Заказ",
        source: "Вручную",
        comments: [],
        trackingNumbers: [],
      },
    ],
    shipments: [],
    items: [
      {
        id: "esp32",
        data: {
          name: "ESP32",
          purchases: [
            {
              id: "purchase",
              orderId: "order",
              status: "delivered",
              quantity: 5,
            },
          ],
          usages: [{ id: "usage", projectId: "robot", quantity: 2 }],
        },
        createdAt: "2026-10-23",
        updatedAt: "2026-10-23",
      },
    ],
  };
  const key = "/projects-test/users/owner/catalog.json";
  const otherKey = "/projects-test/users/other/catalog.json";
  const objects = new Map([
    [key, JSON.stringify(catalog)],
    [
      otherKey,
      JSON.stringify({
        version: 2,
        items: [],
        projects: [{ id: "robot", name: "Чужой робот" }],
      }),
    ],
  ]);
  const server = createServer(async (request, response) => {
    const objectKey = decodeURIComponent(new URL(request.url!, "http://localhost").pathname);
    if (request.method === "PUT") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      objects.set(objectKey, Buffer.concat(chunks).toString());
      response.end();
    } else if (objects.has(objectKey)) {
      response.setHeader("Content-Type", "application/json");
      response.setHeader("ETag", '"fixture"');
      response.end(objects.get(objectKey));
    } else {
      response.writeHead(404, { "Content-Type": "application/xml" });
      response.end("<Error><Code>NoSuchKey</Code></Error>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  Object.assign(process.env, {
    S3_ENDPOINT: `http://127.0.0.1:${address.port}`,
    S3_BUCKET: "projects-test",
    S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "test",
    S3_FORCE_PATH_STYLE: "true",
  });
  const { readCatalog, saveProject } = await import("../lib/components-repo");
  const before = await readCatalog("owner");
  const other = objects.get(otherKey);
  const project = projectSchema.parse({
    id: "robot",
    name: "Робот v2",
    description: "[Схема](https://example.com)",
    images: ["https://example.com/robot.jpg"],
  });
  assert.deepEqual(await saveProject("owner", project, false), project);
  const after = await readCatalog("owner");
  assert.deepEqual(after.items, before.items);
  assert.deepEqual(after.orders, before.orders);
  assert.equal(objects.get(otherKey), other);
  assert.equal(
    await saveProject("owner", { id: "missing", name: "Нет" }, false),
    null,
  );
  await assert.rejects(saveProject("owner", project, true), /уже существует/);
  await assert.rejects(
    saveProject("owner", { id: "other", name: "РОБОТ V2" }, true),
    /Проект с таким названием уже есть/,
  );
  assert.deepEqual((await readCatalog("owner")).projects, [project]);
  const newProject = { id: "new", name: "Новый проект" };
  assert.deepEqual(await saveProject("owner", newProject, true), newProject);
  assert.equal((await readCatalog("owner")).projects.length, 2);
});
