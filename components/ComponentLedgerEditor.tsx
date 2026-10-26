"use client";

import {
  type ComponentData,
  type Logistics,
  type Order,
  type Purchase,
  type Usage,
  PURCHASE_LABELS,
  PURCHASE_STATUSES,
} from "@/lib/schema";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { CommentsEditor } from "@/components/CommentsEditor";
import { InventorySummary } from "@/components/InventorySummary";
import { ProjectPicker } from "@/components/ProjectPicker";
import { StatusSelect } from "@/components/StatusSelect";

type Ledger = { purchases: Purchase[]; usages: Usage[] };
export function logisticsPatch(
  initial: Logistics,
  current: Logistics,
  ledger: Ledger,
): Logistics {
  const projects = (current.projects ?? []).filter(
    (project) =>
      ledger.usages.some((usage) => usage.projectId === project.id) &&
      JSON.stringify(project) !==
        JSON.stringify(
          initial.projects?.find((value) => value.id === project.id),
        ),
  );
  return {
    orders: current.orders.filter(
      (order) =>
        ledger.purchases.some((purchase) => purchase.orderId === order.id) &&
        JSON.stringify(order) !==
          JSON.stringify(initial.orders.find((value) => value.id === order.id)),
    ),
    shipments: [],
    projects: projects.length ? projects : undefined,
  };
}

export function ComponentLedgerEditor({
  value,
  onChange,
  logistics,
  onLogisticsChange,
  initial,
}: {
  value: Ledger;
  onChange: (value: Ledger) => void;
  logistics: Logistics;
  onLogisticsChange: (value: Logistics) => void;
  initial: Logistics;
}) {
  const updatePurchase = (id: string, patch: Partial<Purchase>) =>
    onChange({
      ...value,
      purchases: value.purchases.map((purchase) =>
        purchase.id === id ? { ...purchase, ...patch } : purchase,
      ),
    });
  const updateOrder = (id: string, patch: Partial<Order>) =>
    onLogisticsChange({
      ...logistics,
      orders: logistics.orders.map((order) =>
        order.id === id ? { ...order, ...patch } : order,
      ),
    });
  const updateUsage = (id: string, patch: Partial<Usage>) =>
    onChange({
      ...value,
      usages: value.usages.map((usage) =>
        usage.id === id ? { ...usage, ...patch } : usage,
      ),
    });
  const delivered = value.purchases.filter(
    (purchase) => purchase.status === "delivered",
  );
  const used = value.usages.reduce(
    (sum, usage) => sum + (usage.quantity ?? 0),
    0,
  );
  const known = [...delivered, ...value.usages].every(
    (entry) => entry.quantity !== undefined,
  );
  const overdrawn =
    known &&
    used >
      delivered.reduce((sum, purchase) => sum + (purchase.quantity ?? 0), 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Остаток</h2>
        <InventorySummary
          data={
            { inventory: [], ...value } as Pick<
              ComponentData,
              "inventory" | "purchases" | "usages"
            >
          }
        />
        {overdrawn ? (
          <p role="alert" className="text-sm text-red-500">
            Использовано больше, чем доставлено. Проверьте заказы и
            использование.
          </p>
        ) : null}
      </div>
      <section className="flex flex-col gap-3" aria-label="Заказы">
        <h2 className="text-lg font-semibold">Заказы</h2>
        {value.purchases.map((purchase, index) => {
          const order = logistics.orders.find(
            (order) => order.id === purchase.orderId,
          );
          const first =
            value.purchases.findIndex(
              (entry) => entry.orderId === purchase.orderId,
            ) === index;
          return (
            <div
              key={purchase.id}
              className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={`order-name-${purchase.id}`}
                  className="text-sm font-medium text-[var(--color-muted)]"
                >
                  Название или номер
                </label>
                <button
                  type="button"
                  className="text-sm text-red-500"
                  aria-label={`Удалить заказ ${index + 1} у компонента`}
                  onClick={() =>
                    onChange({
                      ...value,
                      purchases: value.purchases.filter(
                        (entry) => entry.id !== purchase.id,
                      ),
                    })
                  }
                >
                  Убрать
                </button>
              </div>
              {order ? (
                <Input
                  id={`order-name-${purchase.id}`}
                  value={order.number}
                  required
                  maxLength={200}
                  onChange={(event) =>
                    updateOrder(order.id, { number: event.target.value })
                  }
                  placeholder="Например: AliExpress, октябрь"
                />
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Количество"
                  htmlFor={`purchase-count-${purchase.id}`}
                >
                  <Input
                    id={`purchase-count-${purchase.id}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={purchase.quantity ?? ""}
                    placeholder="Неизвестно"
                    onChange={(event) =>
                      updatePurchase(purchase.id, {
                        quantity:
                          event.target.value === ""
                            ? undefined
                            : Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field
                  label="Статус"
                  htmlFor={`purchase-status-${purchase.id}`}
                >
                  <StatusSelect
                    id={`purchase-status-${purchase.id}`}
                    value={purchase.status}
                    onChange={(status) =>
                      updatePurchase(purchase.id, {
                        status,
                      })
                    }
                    options={[
                      ...(purchase.status === "unassigned"
                        ? [{
                            value: "unassigned" as const,
                            label: PURCHASE_LABELS.unassigned,
                            status: "unassigned" as const,
                          }]
                        : []),
                      ...PURCHASE_STATUSES.map((status) => ({
                        value: status,
                        label: PURCHASE_LABELS[status],
                        status,
                      })),
                    ]}
                  />
                </Field>
              </div>
              {order ? (
                <Field
                  label="Трек-номер"
                  htmlFor={`order-track-${order.id}`}
                  hint={
                    order.trackingNumbers.length > 1
                      ? "Ранее сохранённые треки перечислены через запятую."
                      : undefined
                  }
                >
                  <Input
                    id={`order-track-${order.id}`}
                    value={order.trackingNumbers.join(", ")}
                    maxLength={
                      order.trackingNumbers.length > 1 ? undefined : 200
                    }
                    placeholder="Не указан"
                    onChange={(event) =>
                      updateOrder(order.id, {
                        trackingNumbers: event.target.value
                          .split(",")
                          .map((track) => track.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </Field>
              ) : null}
              {order && first ? (
                <details
                  open={!initial.orders.some((value) => value.id === order.id)}
                  className="border-t border-[var(--color-border)] pt-3"
                >
                  <summary className="cursor-pointer text-sm text-[var(--color-muted)]">
                    Ссылка и комментарии
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <Field label="Ссылка" htmlFor={`order-link-${order.id}`}>
                      <Input
                        id={`order-link-${order.id}`}
                        type="url"
                        value={order.url ?? ""}
                        onChange={(event) =>
                          updateOrder(order.id, { url: event.target.value })
                        }
                        placeholder="На заказ или отслеживание"
                      />
                    </Field>
                    {order.url ? (
                      <a
                        href={order.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[var(--color-accent)]"
                      >
                        Открыть ссылку ↗
                      </a>
                    ) : null}
                    <CommentsEditor
                      value={order.comments}
                      onChange={(comments) =>
                        updateOrder(order.id, { comments })
                      }
                      label={`заказ ${order.number || "без названия"}`}
                    />
                  </div>
                </details>
              ) : null}
            </div>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          disabled={value.purchases.length >= 1000}
          onClick={() => {
            const order: Order = {
              id: crypto.randomUUID(),
              number: "",
              source: "Вручную",
              comments: [],
              trackingNumbers: [],
            };
            onLogisticsChange({
              ...logistics,
              orders: [...logistics.orders, order],
            });
            onChange({
              ...value,
              purchases: [
                ...value.purchases,
                {
                  id: crypto.randomUUID(),
                  orderId: order.id,
                  status: "planned",
                  quantity: 1,
                },
              ],
            });
          }}
        >
          Добавить заказ
        </Button>
      </section>
      <section className="flex flex-col gap-3" aria-label="Использование">
        <h2 className="text-lg font-semibold">Использование</h2>
        {value.usages.map((usage, index) => {
          const project = logistics.projects?.find(
            (project) => project.id === usage.projectId,
          );
          const newProject =
            project &&
            !initial.projects?.some((value) => value.id === project.id);
          return (
            <div
              key={usage.id}
              className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] p-3"
            >
              <div className="flex items-center gap-2">
                <ProjectPicker
                  projects={logistics.projects ?? []}
                  value={usage.projectId}
                  onChange={(id) => updateUsage(usage.id, { projectId: id })}
                  onCreate={() => {
                    const project = { id: crypto.randomUUID(), name: "" };
                    onLogisticsChange({
                      ...logistics,
                      projects: [...(logistics.projects ?? []), project],
                    });
                    updateUsage(usage.id, { projectId: project.id });
                  }}
                />
                <button
                  type="button"
                  className="shrink-0 px-1 text-sm text-red-500"
                  aria-label={`Удалить использование ${index + 1}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      usages: value.usages.filter(
                        (entry) => entry.id !== usage.id,
                      ),
                    })
                  }
                >
                  Убрать
                </button>
              </div>
              {newProject ? (
                <Field
                  label="Название проекта"
                  htmlFor={`project-name-${usage.id}`}
                >
                  <Input
                    id={`project-name-${usage.id}`}
                    value={project.name}
                    maxLength={200}
                    required
                    onChange={(event) =>
                      onLogisticsChange({
                        ...logistics,
                        projects: logistics.projects?.map((value) =>
                          value.id === project.id
                            ? { ...value, name: event.target.value }
                            : value,
                        ),
                      })
                    }
                  />
                </Field>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`usage-count-${usage.id}`} className="text-sm text-[var(--color-muted)]">
                  Количество
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`Уменьшить количество для использования ${index + 1}`}
                    disabled={usage.quantity === undefined || usage.quantity <= 0}
                    onClick={() => updateUsage(usage.id, { quantity: (usage.quantity ?? 0) - 1 })}
                    className="flex size-10 items-center justify-center rounded-lg border border-[var(--color-border)] text-xl disabled:opacity-40"
                  >
                    −
                  </button>
                  <Input
                    id={`usage-count-${usage.id}`}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={usage.quantity ?? ""}
                    placeholder="—"
                    className="w-20 px-1 text-center text-sm"
                    onChange={(event) =>
                      updateUsage(usage.id, {
                        quantity:
                          event.target.value === ""
                            ? undefined
                            : Number(event.target.value),
                      })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Увеличить количество для использования ${index + 1}`}
                    disabled={usage.quantity !== undefined && !Number.isSafeInteger(usage.quantity + 1)}
                    onClick={() => updateUsage(usage.id, { quantity: (usage.quantity ?? 0) + 1 })}
                    className="flex size-10 items-center justify-center rounded-lg border border-[var(--color-border)] text-xl disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          disabled={value.usages.length >= 1000}
          onClick={() =>
            onChange({
              ...value,
              usages: [
                ...value.usages,
                { id: crypto.randomUUID(), projectId: "", quantity: 1 },
              ],
            })
          }
        >
          Добавить использование
        </Button>
      </section>
    </div>
  );
}
