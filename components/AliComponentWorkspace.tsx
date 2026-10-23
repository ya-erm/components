"use client";

import { useState } from "react";

import {
  ComponentForm, type ComponentFormDraft,
} from "@/components/ComponentForm";
import { ComponentGrid } from "@/components/ComponentGrid";
import { AppHeader } from "@/components/AppHeader";
import { ImportWorkspace } from "@/components/ImportWorkspace";
import {
  componentDataSchema,
  type ComponentData,
  type Logistics,
  type Purchase,
} from "@/lib/schema";
import type { ComponentDTO } from "@/lib/components-repo";
import type { AliAnalysis, AliRow, AliSelection } from "@/lib/aliexpress";

function cataloguePreferences(): {
  view: "grid" | "compact" | "list";
  collapsed: { type: string[]; tag: string[] };
} {
  const cookie = (name: string) =>
    typeof document === "undefined"
      ? undefined
      : document.cookie
          .split("; ")
          .find((part) => part.startsWith(`${name}=`))
          ?.slice(name.length + 1);
  const collapsed = (name: string): string[] => {
    try {
      const value: unknown = JSON.parse(
        decodeURIComponent(cookie(name) ?? "[]"),
      );
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  };
  const view = cookie("components-view-mode");
  return {
    view: view === "list" || view === "compact" ? view : ("grid" as const),
    collapsed: {
      type: collapsed("components-collapsed-groups-type"),
      tag: collapsed("components-collapsed-groups-tag"),
    },
  };
}

export function AliComponentWorkspace({
  ownerId,
  row,
  analysis,
  mode,
  componentDraft,
  quantity,
  status,
  onChoose,
  onDraft,
  onClose,
  formDraft,
  onFormChange,
}: {
  ownerId: string;
  row: AliRow;
  analysis: AliAnalysis;
  mode: "choose" | "new";
  componentDraft?: AliSelection["componentDraft"];
  quantity?: number;
  status: Purchase["status"];
  onChoose: (item: ComponentDTO) => void;
  onDraft: (
    value: { data: ComponentData; logistics?: Logistics },
    source: Purchase,
  ) => void;
  onClose: () => void;
  formDraft?: ComponentFormDraft;
  onFormChange: (value: ComponentFormDraft) => void;
}) {
  const [preferences] = useState(cataloguePreferences);
  const [savedForm] = useState(formDraft);
  const sourceId = `ali-source-${row.id}`;
  const sourceOrder = componentDraft?.logistics?.orders.find(
    (order) => order.id === sourceId,
  ) ?? {
    id: sourceId,
    number: row.orderId,
    source: "AliExpress",
    store: row.store,
    url: row.orderUrl,
    comments: [],
    trackingNumbers: row.trackingNumbers,
  };
  const initialLogistics: Logistics = savedForm?.logistics ?? {
    ...analysis.logistics,
    orders: [
      ...analysis.logistics.orders,
      ...(componentDraft?.logistics?.orders ?? []).filter(
        (order) =>
          !analysis.logistics.orders.some((saved) => saved.id === order.id) &&
          order.id !== sourceId,
      ),
      sourceOrder,
    ],
    projects: [
      ...(analysis.logistics.projects ?? []),
      ...(componentDraft?.logistics?.projects ?? []).filter(
        (project) =>
          !analysis.logistics.projects?.some(
            (saved) => saved.id === project.id,
          ),
      ),
    ],
  };
  const initial = savedForm?.data ?? componentDataSchema.parse({
    name:
      row.title === "Без названия"
        ? "Новый компонент"
        : row.title.slice(0, 200),
    images: row.imageUrl ? [row.imageUrl] : [],
    url: row.productUrl,
    ...componentDraft?.data,
    purchases: [
      ...(componentDraft?.data.purchases ?? []).filter(
        (p) => p.id !== sourceId,
      ),
      { id: sourceId, orderId: sourceId, quantity, status },
    ],
  });
  return (
    <ImportWorkspace
      label={
        mode === "choose" ? "Выбор компонента" : "Новый компонент для импорта"
      }
      onClose={onClose}
    >
      {mode === "choose" ? (
        <>
          <AppHeader
            title="Выберите компонент"
            left={
              <button
                type="button"
                className="px-2 py-2 text-[var(--color-accent)]"
                onClick={onClose}
              >
                ‹ К импорту
              </button>
            }
          />
          <div className="mx-auto max-w-5xl px-4 pb-6">
            <p className="py-3 text-sm text-[var(--color-muted)]">
              Для товара: {row.title}
              {row.sku ? ` · ${row.sku}` : ""}
            </p>
            <ComponentGrid
              ownerId={ownerId}
              initial={{
                items: analysis.components,
                total: analysis.components.length,
                page: 1,
                pageSize: 50,
              }}
              initialViewMode={preferences.view}
              initialCollapsedGroups={preferences.collapsed}
              onSelect={onChoose}
            />
          </div>
        </>
      ) : (
        <ComponentForm
          initial={initial}
          initialLogistics={initialLogistics}
          title="Новый компонент"
          backHref="/components/import/aliexpress"
          onCancelDraft={onClose}
          onDraftChange={onFormChange}
          onSaveDraft={(value) => {
            const source = value.data.purchases?.find(
              (purchase) => purchase.id === sourceId,
            );
            if (!source)
              throw new Error(
                "Импортируемую покупку нельзя удалить. Чтобы пропустить товар, вернитесь к импорту.",
              );
            const sourceOrder =
              value.logistics?.orders.find((order) => order.id === sourceId) ??
              initialLogistics.orders.find((order) => order.id === sourceId)!;
            onDraft(
              {
                ...value,
                logistics: {
                  orders: [
                    ...(value.logistics?.orders ?? []).filter(
                      (order) => order.id !== sourceId,
                    ),
                    sourceOrder,
                  ],
                  shipments: value.logistics?.shipments ?? [],
                  projects: value.logistics?.projects,
                },
              },
              source,
            );
          }}
        />
      )}
    </ImportWorkspace>
  );
}
