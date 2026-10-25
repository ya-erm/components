import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SearchParamsContext,
  PathnameContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { ComponentGrid } from "../components/ComponentGrid";
import { componentDataSchema } from "../lib/schema";

const items = ["ESP32", "Драйвер"].map((name, index) => ({
  id: `item-${index}`,
  data: componentDataSchema.parse({
    name,
    type: "Модуль",
    purchases: [],
    usages: [],
  }),
  createdAt: "2026-10-25T00:00:00.000Z",
  updatedAt: "2026-10-25T00:00:00.000Z",
}));

function render(
  view: "grid" | "compact" | "list",
  mode: "multiple" | "single" | "catalog",
) {
  return renderToStaticMarkup(
    createElement(
      PathnameContext.Provider,
      { value: "/components" },
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams() },
        createElement(ComponentGrid, {
          ownerId: "fixture",
          initial: { items, total: items.length, page: 1, pageSize: 50 },
          initialViewMode: view,
          initialCollapsedGroups: { type: [], tag: [] },
          onSelect: mode === "catalog" ? undefined : () => {},
          selection:
            mode !== "multiple"
              ? undefined
              : {
                  selectedIds: new Set(["item-0"]),
                  renderDetails: (item) =>
                    item.id === "item-0"
                      ? createElement("input", {
                          "aria-label": "Количество ESP32",
                          defaultValue: "2",
                        })
                      : null,
                },
        }),
      ),
    ),
  );
}

for (const view of ["grid", "compact", "list"] as const) {
  test(`catalog ${view} supports accessible multiselect and separate quantity controls`, () => {
    const html = render(view, "multiple");
    assert.match(html, /aria-label="Убрать ESP32" aria-pressed="true"/);
    assert.match(html, /aria-label="Выбрать Драйвер" aria-pressed="false"/);
    assert.match(html, /aria-label="Поиск по компонентам"/);
    assert.match(html, /aria-label="Фильтр по статусу"/);
    assert.match(html, /aria-label="Фильтр по типу"/);
    assert.match(html, /aria-label="Фильтр по тегу"/);
    const selectedButton = html.match(
      /<button\b[^>]*aria-label="Убрать ESP32"[\s\S]*?<\/button>/,
    )?.[0];
    assert.ok(selectedButton);
    assert.ok(
      !selectedButton.includes("Количество ESP32"),
      "Quantity input must not be nested in a card button",
    );
    assert.match(html, /aria-label="Количество ESP32"/);
    assert.ok(
      !html.includes('href="/components/item-'),
      "Selecting must not navigate to a component page",
    );
    for (const button of html.match(/<button\b[^>]*>/g) ?? [])
      assert.match(
        button,
        /type="button"/,
        "Catalog controls must not submit the project form",
      );
  });
  test(`catalog ${view} preserves ordinary links and single-select imports`, () => {
    assert.match(render(view, "catalog"), /href="\/components\/item-0"/);
    const single = render(view, "single");
    const card = single.match(
      /<button\b[^>]*aria-label="Выбрать ESP32"[^>]*>/,
    )?.[0];
    assert.ok(card);
    assert.ok(
      !card.includes("aria-pressed"),
      "Single-select import must not turn into multiselect",
    );
  });
}
