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
import { ChevronDownIcon, Field, Input, ProjectsIcon } from "@/components/ui/Field";
import { CommentsEditor } from "@/components/CommentsEditor";
import { InventorySummary } from "@/components/InventorySummary";
import { ProjectPicker } from "@/components/ProjectPicker";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusIcon } from "@/components/StatusIcon";
import { StatusSelect } from "@/components/StatusSelect";

type Ledger = { purchases: Purchase[]; usages: Usage[] };
const sectionSummaryClass =
  "flex min-h-12 w-full cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden";

function projectCountText(count: number) {
  const form = new Intl.PluralRules("ru").select(count);
  return `${count} ${form === "one" ? "проект" : form === "few" ? "проекта" : "проектов"}`;
}

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
  const inventoryData: Pick<
    ComponentData,
    "inventory" | "purchases" | "usages"
  > = { inventory: [], ...value };
  const projectCount = new Set(
    value.usages.map((usage) => usage.projectId).filter(Boolean),
  ).size;
  const usageQuantityKnown = value.usages.every(
    (usage) => usage.quantity !== undefined,
  );
  const usedDisplay = usageQuantityKnown ? String(used) : used > 0 ? `${used}+` : "—";
  return (
    <div className="flex flex-col gap-6">
      <details className="group">
        <summary className={sectionSummaryClass}>
          <StatusIcon status="in_stock" className="!size-5 text-emerald-600" />
          <span role="heading" aria-level={2} className="shrink-0 text-lg font-semibold">Остаток</span>
          <span className="flex min-w-0 flex-1">
            <InventorySummary data={inventoryData} compact />
          </span>
          {overdrawn ? (
            <span aria-label="Использовано больше, чем доставлено" className="text-sm font-bold text-red-500">!</span>
          ) : null}
          <ChevronDownIcon className="ml-auto size-5 shrink-0 text-[var(--color-muted)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <InventorySummary data={inventoryData} showLabels />
          {overdrawn ? (
            <p role="alert" className="text-sm text-red-500">
              Использовано больше, чем доставлено. Проверьте заказы и
              использование.
            </p>
          ) : null}
        </div>
      </details>
      <details className="group" onInvalidCapture={(event) => { event.currentTarget.open = true; }}>
        <summary className={sectionSummaryClass}>
          <StatusIcon status="in_transit" className="!size-5 text-amber-600" />
          <span role="heading" aria-level={2} className="shrink-0 text-lg font-semibold">Заказы</span>
          <span className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto whitespace-nowrap">
            {value.purchases.map((purchase, index) => {
              const badgeStatus = purchase.status === "delivered"
                ? "in_stock"
                : purchase.status === "cancelled"
                  ? "out_of_stock"
                  : purchase.status;
              const label = `Заказ ${index + 1}: ${PURCHASE_LABELS[purchase.status]}, ${purchase.quantity === undefined ? "количество неизвестно" : `${purchase.quantity} шт.`}`;
              return (
                <StatusBadge
                  key={purchase.id}
                  status={badgeStatus}
                  size="compact"
                  className="gap-px"
                  title={label}
                  aria-label={label}
                >
                  <StatusIcon status={purchase.status} compact />
                  <span className="tabular-nums" aria-hidden="true">{purchase.quantity ?? "—"}</span>
                </StatusBadge>
              );
            })}
            {!value.purchases.length ? (
              <span className="text-xs text-[var(--color-muted)]">Нет заказов</span>
            ) : null}
          </span>
          <ChevronDownIcon className="ml-auto size-5 shrink-0 text-[var(--color-muted)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 flex flex-col gap-3">
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
                className="flex flex-col gap-2.5 rounded-xl border border-[var(--color-border)] p-2.5 sm:p-3"
              >
                <div className="flex items-center gap-2">
                  {order ? (
                    <Input
                      id={`order-name-${purchase.id}`}
                      aria-label={`Название или номер заказа ${index + 1}`}
                      value={order.number}
                      required
                      maxLength={200}
                      onChange={(event) =>
                        updateOrder(order.id, { number: event.target.value })
                      }
                      placeholder="Название или номер"
                      className="min-w-0 flex-1"
                    />
                  ) : null}
                  <button
                    type="button"
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] text-red-500 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
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
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-5">
                      <path
                        d="M4.5 6h11M8 6V4.8A1.3 1.3 0 0 1 9.3 3.5h1.4A1.3 1.3 0 0 1 12 4.8V6m2.2 0-.5 9A1.5 1.5 0 0 1 12.2 16.5H7.8A1.5 1.5 0 0 1 6.3 15l-.5-9"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
                    <Input
                      id={`purchase-count-${purchase.id}`}
                      aria-label={`Количество в заказе ${index + 1}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={purchase.quantity ?? ""}
                      placeholder="Шт."
                      className="min-w-0 px-2 text-center"
                      onChange={(event) =>
                        updatePurchase(purchase.id, {
                          quantity:
                            event.target.value === ""
                              ? undefined
                              : Number(event.target.value),
                        })
                      }
                    />
                    <StatusSelect
                      id={`purchase-status-${purchase.id}`}
                      aria-label={`Статус заказа ${index + 1}`}
                      className="px-2.5 text-sm"
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
                </div>
                {order ? (
                  <div>
                    <Input
                      id={`order-track-${order.id}`}
                      aria-label="Трек-номер"
                      value={order.trackingNumbers.join(", ")}
                      maxLength={
                        order.trackingNumbers.length > 1 ? undefined : 200
                      }
                      placeholder="Трек-номер"
                      onChange={(event) =>
                        updateOrder(order.id, {
                          trackingNumbers: event.target.value
                            .split(",")
                            .map((track) => track.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                    {order.trackingNumbers.length > 1 ? (
                      <p className="mt-1 text-xs text-[var(--color-muted)]">
                        Трек-номера перечислены через запятую.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {order && first ? (
                  <details
                    open={!initial.orders.some((value) => value.id === order.id)}
                    className="border-t border-[var(--color-border)] pt-2.5"
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
        </div>
      </details>
      <details className="group" onInvalidCapture={(event) => { event.currentTarget.open = true; }}>
        <summary className={sectionSummaryClass}>
          <ProjectsIcon className="size-5 shrink-0 text-blue-600" />
          <span role="heading" aria-level={2} className="shrink-0 text-lg font-semibold">Использование</span>
          <span
            className="min-w-0 flex-1 truncate text-left text-xs text-[var(--color-muted)]"
            aria-label={`Проектов: ${projectCount}, всего ${usedDisplay} шт.`}
          >
            {projectCountText(projectCount)} · {usedDisplay} шт.
          </span>
          <ChevronDownIcon className="ml-auto size-5 shrink-0 text-[var(--color-muted)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 flex flex-col gap-3">
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
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] text-red-500 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
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
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-5">
                      <path
                        d="M4.5 6h11M8 6V4.8A1.3 1.3 0 0 1 9.3 3.5h1.4A1.3 1.3 0 0 1 12 4.8V6m2.2 0-.5 9A1.5 1.5 0 0 1 12.2 16.5H7.8A1.5 1.5 0 0 1 6.3 15l-.5-9"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
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
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] text-xl disabled:opacity-40"
                    >
                      −
                    </button>
                    <div className="w-16 shrink-0">
                      <Input
                        id={`usage-count-${usage.id}`}
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={usage.quantity ?? ""}
                        placeholder="—"
                        className="!bg-white px-1 text-center text-sm text-zinc-900"
                        onChange={(event) =>
                          updateUsage(usage.id, {
                            quantity:
                              event.target.value === ""
                                ? undefined
                                : Number(event.target.value),
                          })
                        }
                      />
                    </div>
                    <button
                      type="button"
                      aria-label={`Увеличить количество для использования ${index + 1}`}
                      disabled={usage.quantity !== undefined && !Number.isSafeInteger(usage.quantity + 1)}
                      onClick={() => updateUsage(usage.id, { quantity: (usage.quantity ?? 0) + 1 })}
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] text-xl disabled:opacity-40"
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
        </div>
      </details>
    </div>
  );
}
