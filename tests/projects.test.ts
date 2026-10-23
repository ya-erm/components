import assert from "node:assert/strict";
import { test } from "node:test";
import { projectSchema, MAX_IMAGES, logisticsSchema } from "../lib/schema";
import { parseCatalog, mergeLogistics, validateCatalog } from "../lib/catalog";

test("old projects remain compatible; descriptions and ordered photos survive catalog round trips", () => {
  const old = { id: "robot", name: "Робот" };
  assert.deepEqual(projectSchema.parse(old), old);
  const project = projectSchema.parse({
    ...old,
    description:
      "## Робот\n\n[Схема](https://example.com)\n\n- ESP32\n- Драйвер",
    images: ["https://example.com/cover.jpg", "https://example.com/back.jpg"],
  });
  const catalog = parseCatalog({ version: 2, items: [], projects: [project] });
  assert.deepEqual(parseCatalog(JSON.parse(JSON.stringify(catalog))).projects, [
    project,
  ]);
  const updated = mergeLogistics(
    catalog,
    logisticsSchema.parse({
      projects: [{ ...project, name: "Робот 2", description: "", images: [] }],
    }),
  );
  assert.deepEqual(updated.projects[0].images, []);
  assert.equal(updated.projects[0].description, undefined);
  assert.equal(updated.projects[0].id, old.id);
});

test("project validation rejects invalid photos, excessive content, and duplicate names", () => {
  for (const patch of [
    { images: ["javascript:alert(1)"] },
    { images: ["data:image/png;base64,AA"] },
    { images: Array(MAX_IMAGES + 1).fill("https://example.com/photo.jpg") },
    { description: "a".repeat(20001) },
    { name: " " },
  ])
    assert.equal(
      projectSchema.safeParse({ id: "robot", name: "Робот", ...patch }).success,
      false,
    );
  const catalog = parseCatalog({
    version: 2,
    items: [],
    projects: [{ id: "robot", name: "Робот" }],
  });
  const duplicate = mergeLogistics(
    catalog,
    logisticsSchema.parse({ projects: [{ id: "other", name: "РОБОТ" }] }),
  );
  assert.throws(
    () => validateCatalog(duplicate),
    /Проект с таким названием уже есть/,
  );
});
