"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  AliAnalysis,
  AliPreview,
  AliRow,
  AliSelection,
} from "@/lib/aliexpress";
import { PURCHASE_LABELS, type Purchase } from "@/lib/schema";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/states";
import { ComponentCard } from "@/components/ComponentCard";
import dynamic from "next/dynamic";
import { AliImportPreview } from "@/components/AliImportPreview";
import { AliKindFilter } from "@/components/AliKindFilter";
import {
  ALI_KIND_LABELS as KINDS,
  matchesAliKinds,
  parseAliKinds,
  type AliKindFilter as Kind,
} from "@/lib/aliexpress-filter";
import type { ComponentFormDraft } from "@/components/ComponentForm";
import { useImportDraft } from "@/components/useImportDraft";
import {
  backImportStep,
  finishImportStep,
  pushImportStep,
  restoreImportStep,
  useImportHistory,
  type ImportStep,
} from "@/components/useImportHistory";

const AliComponentWorkspace = dynamic(
  () =>
    import("@/components/AliComponentWorkspace").then(
      (module) => module.AliComponentWorkspace,
    ),
  { loading: () => <p role="status">Открываю карточки компонентов…</p> },
);

type Draft = {
  componentId: string;
  purchaseId: string;
  name: string;
  unitsPerPack: string;
  quantity: string;
  status: Purchase["status"];
  quantityEdited: boolean;
  statusEdited: boolean;
  componentDraft?: AliSelection["componentDraft"];
};
type VisibilityJob = {
  rowIds: string[];
  ignored: boolean;
  previousSelected: Record<string, Draft>;
};
function initialDraft(row: AliRow): Draft {
  return {
    componentId: row.binding?.componentId ?? "",
    purchaseId: row.binding?.purchaseId ?? "",
    name: row.title === "Без названия" ? "" : row.title.slice(0, 200),
    unitsPerPack: String(row.binding?.unitsPerPack ?? 1),
    quantity: String(
      row.binding ? (row.binding.quantity ?? "") : (row.quantity ?? ""),
    ),
    status: row.binding?.status ?? row.status,
    quantityEdited: false,
    statusEdited: false,
  };
}

async function request<T>(
  action: string,
  source: unknown,
  selections?: AliSelection[],
  token?: string,
  rowIds?: string[],
): Promise<T> {
  const response = await fetch("/api/components/aliexpress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data: source, selections, token, rowIds }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body?.error ?? "Не удалось выполнить импорт. Попробуйте ещё раз.",
    );
  return body;
}

export function AliExpressImport({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [data, setData] = useState<unknown>(null);
  const [analysis, setAnalysis] = useState<AliAnalysis | null>(null);
  const [selected, setSelected] = useState<Record<string, Draft>>({});
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [since, setSince] = useState("");
  const [preview, setPreview] = useState<AliPreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [done, setDone] = useState<AliPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingVisibility, setPendingVisibility] = useState<VisibilityJob[]>([]);
  const visibilityInFlight = useRef(false);
  const [workspace, setWorkspace] = useState<{
    rowId: string;
    mode: "choose" | "new";
  } | null>(null);
  const [formDrafts, setFormDrafts] = useState<
    Record<string, ComponentFormDraft>
  >({});
  const draftSnapshot = useMemo(
    () => analysis && !done ? {
      fileName, data, analysis, selected, query, kinds, since, preview,
      showPreview, done, workspace, formDrafts, pendingVisibility,
    } : null,
    [fileName, data, analysis, selected, query, kinds, since, preview,
      showPreview, done, workspace, formDrafts, pendingVisibility],
  );
  const { ready, storageError, savedAt } = useImportDraft(
    `aliexpress-import:v1:${ownerId}`,
    draftSnapshot,
    (saved) => {
      if (!saved || !Array.isArray(saved.analysis?.rows) || !saved.selected)
        return;
      setFileName(saved.fileName);
      setData(saved.data);
      setAnalysis(saved.analysis);
      setSelected(saved.selected);
      setQuery(saved.query);
      setKinds(parseAliKinds(saved.kinds ?? (saved as { kind?: unknown }).kind));
      setSince(saved.since);
      setPreview(saved.preview);
      setShowPreview(saved.showPreview);
      setDone(saved.done);
      setWorkspace(saved.workspace);
      setFormDrafts(saved.formDrafts ?? {});
      setPendingVisibility(saved.pendingVisibility ?? []);
      restoreImportStep(
        saved.workspace ?? (saved.showPreview && saved.preview ? "preview" : null),
      );
    },
  );
  const followHistory = useCallback((step: ImportStep | null) => {
    setWorkspace(step && step !== "preview" ? step : null);
    setShowPreview(step === "preview");
  }, []);
  useImportHistory(followHistory);
  const workspaceRowId = workspace?.rowId;
  const rememberForm = useCallback(
    (value: ComponentFormDraft) => {
      if (!workspaceRowId) return;
      setFormDrafts((previous) => ({ ...previous, [workspaceRowId]: value }));
    },
    [workspaceRowId],
  );
  function closeStep() {
    if (!backImportStep()) {
      finishImportStep();
      followHistory(null);
    }
  }
  useEffect(() => {
    const job = pendingVisibility[0];
    if (!ready || !job || visibilityInFlight.current) return;
    visibilityInFlight.current = true;
    void request<AliAnalysis>(
      job.ignored ? "hide" : "restore", data, undefined, undefined, job.rowIds,
    )
      .then(setAnalysis)
      .catch((err: unknown) => {
        setSelected((previous) => ({ ...job.previousSelected, ...previous }));
        setError(
          `Не удалось сохранить исключение. Изменение видимости отменено. ${err instanceof Error ? err.message : "Попробуйте ещё раз."}`,
        );
      })
      .finally(() => {
        visibilityInFlight.current = false;
        setPendingVisibility((previous) => previous.slice(1));
      });
  }, [ready, pendingVisibility, data]);
  const displayRows = analysis?.rows.map((row) => {
    const job = pendingVisibility.findLast(
      (entry) => entry.rowIds.includes(row.id),
    );
    return job ? { ...row, ignored: job.ignored } : row;
  }) ?? [];
  const savingVisibility = pendingVisibility.length > 0;
  const count = Object.keys(selected).length;

  async function load(file: File) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("Файл слишком большой. Максимум 4 МБ.");
      let source: unknown;
      try {
        source = JSON.parse(await file.text());
      } catch {
        throw new Error("Файл не является корректным JSON");
      }
      const result = await request<AliAnalysis>("analyze", source);
      resetDraft();
      setData(source);
      setAnalysis(result);
      setFileName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка чтения файла");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function resetDraft() {
    setFileName("");
    setPreview(null);
    setShowPreview(false);
    setDone(null);
    setFormDrafts({});
    setWorkspace(null);
    finishImportStep();
    setSelected({});
    setAnalysis(null);
    setData(null);
    setQuery("");
    setKinds([]);
    setSince("");
    setError("");
    setNotice("");
  }

  function choose(rows: AliRow[], checked: boolean) {
    setSelected((previous) => {
      const next = { ...previous };
      for (const row of rows) {
        if (row.ignored) continue;
        if (checked) next[row.id] ??= initialDraft(row);
        else delete next[row.id];
      }
      return next;
    });
  }
  function edit(id: string, patch: Partial<Draft>) {
    setSelected((previous) => ({
      ...previous,
      [id]: { ...previous[id], ...patch },
    }));
  }
  function selections(rowIds?: string[]): AliSelection[] {
    return Object.entries(selected)
      .filter(([id]) => !rowIds || rowIds.includes(id))
      .map(([rowId, draft]) => ({
      rowId,
      componentId: draft.componentId || undefined,
      purchaseId: draft.purchaseId || undefined,
      name: draft.componentId ? undefined : draft.name.trim() || undefined,
      componentDraft: draft.componentId ? undefined : draft.componentDraft,
      unitsPerPack: Number(draft.unitsPerPack),
      quantity: draft.quantityEdited
        ? draft.quantity === ""
          ? null
          : Number(draft.quantity)
        : undefined,
      status: draft.statusEdited ? draft.status : undefined,
    }));
  }
  function openWorkspace(rowId: string, mode: "choose" | "new") {
    const draft = selected[rowId];
    if (
      !Number.isSafeInteger(Number(draft.unitsPerPack)) ||
      Number(draft.unitsPerPack) < 1 ||
      (draft.quantity !== "" &&
        (!Number.isSafeInteger(Number(draft.quantity)) ||
          Number(draft.quantity) < 0))
    ) {
      setError(
        "Укажите целое неотрицательное количество и число штук в упаковке не меньше 1.",
      );
      return;
    }
    const step = { rowId, mode };
    pushImportStep(step);
    setWorkspace(step);
  }
  async function review(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (
        Object.values(selected).some(
          (draft) => !draft.componentId && !draft.componentDraft,
        )
      )
        throw new Error(
          "Заполните карточку нового компонента или выберите существующий компонент для каждого товара.",
        );
      setPreview(await request<AliPreview>("preview", data, selections()));
      pushImportStep("preview");
      setShowPreview(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка предпросмотра");
    } finally {
      setBusy(false);
    }
  }

  function visibility(row: AliRow) {
    setError("");
    const rowIds = displayRows
      .filter((item) => item.id === row.id || (
        row.itemKey && item.orderId === row.orderId && item.itemKey === row.itemKey
      ))
      .map((item) => item.id);
    const previousSelected = Object.fromEntries(
      Object.entries(selected).filter(([id]) => rowIds.includes(id)),
    );
    setPendingVisibility((previous) => [
      ...previous, { rowIds, ignored: !row.ignored, previousSelected },
    ]);
    if (!row.ignored) setSelected((previous) => Object.fromEntries(
      Object.entries(previous).filter(([id]) => !rowIds.includes(id)),
    ));
  }

  async function applyRow(row: AliRow) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const choice = selections([row.id]);
      const planned = await request<AliPreview>("preview", data, choice);
      const result = await request<AliPreview>(
        "apply", data, choice, planned.token,
      );
      setSelected((previous) => Object.fromEntries(
        Object.entries(previous).filter(([id]) => id !== row.id),
      ));
      setFormDrafts((previous) => Object.fromEntries(
        Object.entries(previous).filter(([id]) => id !== row.id),
      ));
      setPreview(null);
      setNotice(
        `Сохранено: ${result.changes[0]?.name ?? row.title}. Остальные товары остались в черновике.`,
      );
      try {
        setAnalysis(await request<AliAnalysis>("analyze", data));
      } catch {
        setError("Товар сохранён, но обновить список не удалось. Повторная загрузка JSON обновит привязки.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить товар");
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<AliPreview>(
        "apply",
        data,
        selections(),
        preview.token,
      );
      setDone(result);
      setPreview(null);
      setShowPreview(false);
      setFormDrafts({});
      finishImportStep();
      setSelected({});
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
      // Повторная запись возможна только после нового предпросмотра.
      setPreview(null);
      setShowPreview(false);
      finishImportStep();
      try {
        setAnalysis(await request<AliAnalysis>("analyze", data));
      } catch {
        /* Сохраняем выбор и основную ошибку. */
      }
    } finally {
      setBusy(false);
    }
  }

  const filtered =
    displayRows.filter(
      (row) =>
        matchesAliKinds(row, kinds) &&
        (!since || row.dateSort >= since) &&
        (!query ||
          [row.orderId, row.title, row.sku, row.store, ...row.trackingNumbers]
            .join(" ")
            .toLowerCase()
            .includes(query.trim().toLowerCase())),
    );
  const groups = new Map<string, AliRow[]>();
  for (const row of filtered)
    groups.set(row.orderId, [...(groups.get(row.orderId) ?? []), row]);

  if (!ready) return <p role="status">Восстанавливаю импорт…</p>;

  return (
    <div className="flex flex-col gap-5">
      {workspace && analysis && selected[workspace.rowId] ? (
        <AliComponentWorkspace
          key={`${workspace.rowId}:${workspace.mode}`}
          mode={workspace.mode}
          row={analysis.rows.find((row) => row.id === workspace.rowId)!}
          analysis={analysis}
          componentDraft={selected[workspace.rowId].componentDraft}
          quantity={
            selected[workspace.rowId].quantity === ""
              ? undefined
              : Number(selected[workspace.rowId].quantity)
          }
          status={selected[workspace.rowId].status}
          formDraft={formDrafts[workspace.rowId]}
          onFormChange={rememberForm}
          onClose={closeStep}
          onChoose={(item) => {
            setAnalysis((previous) =>
              previous
                ? {
                    ...previous,
                    components: [
                      ...previous.components.filter(
                        (entry) => entry.id !== item.id,
                      ),
                      {
                        ...item,
                        name: item.data.name,
                        purchases: (item.data.purchases ?? []).map(
                          (purchase) => ({
                            id: purchase.id,
                            order:
                              previous.logistics.orders.find(
                                (order) => order.id === purchase.orderId,
                              )?.number ?? purchase.orderId,
                            quantity: purchase.quantity,
                            status: purchase.status,
                            aliOrderId: (() => {
                              const order = previous.logistics.orders.find(
                                (entry) => entry.id === purchase.orderId,
                              );
                              return order?.source.trim().toLowerCase() === "aliexpress"
                                ? order.number : order?.aliexpress?.orderId;
                            })(),
                            productUrl: purchase.aliexpress?.productUrl,
                            unitsPerPack:
                              purchase.aliexpress?.unitsPerPack ?? 1,
                          }),
                        ),
                      },
                    ],
                  }
                : previous,
            );
            edit(workspace.rowId, { componentId: item.id, purchaseId: "" });
            closeStep();
          }}
          onDraft={(value, source) => {
            const current = selected[workspace.rowId];
            edit(workspace.rowId, {
              componentId: "",
              purchaseId: "",
              componentDraft: value,
              name: value.data.name,
              quantity: String(source.quantity ?? ""),
              status: source.status,
              quantityEdited:
                current.quantityEdited ||
                String(source.quantity ?? "") !== current.quantity,
              statusEdited:
                current.statusEdited || source.status !== current.status,
            });
            closeStep();
          }}
        />
      ) : null}
      <p className="text-sm text-[var(--color-muted)]">
        Загрузите выгрузку заказов, выберите нужные товары и проверьте
        изменения. Сохранённые привязки подставятся при следующем импорте.
      </p>
      {analysis && !done ? (
        <section
          aria-label="Черновик импорта"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
        >
          <div className="min-w-0 text-sm">
            <p className="font-medium">Черновик импорта</p>
            <p className="text-xs text-[var(--color-muted)]">
              {savedAt && !storageError
                ? `Сохранён в этом браузере · ${new Date(savedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
                : "Сохраняю в браузере…"}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Можно уйти и продолжить позже. Компоненты сохранятся после подтверждения.
            </p>
          </div>
          {savingVisibility ? (
            <p role="status" className="text-xs text-[var(--color-muted)]">
              Сохраняю исключения…
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={busy || savingVisibility}
            onClick={resetDraft}
          >
            Удалить черновик
          </Button>
        </section>
      ) : null}
      {storageError ? (
        <p role="alert" className="text-sm text-red-500">
          Браузер не смог сохранить черновик. Не закрывайте страницу до
          завершения импорта.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={busy || savingVisibility}
          onClick={() => fileInput.current?.click()}
        >
          {busy ? <Spinner /> : null}
          {analysis ? "Заменить JSON AliExpress" : "Загрузить JSON AliExpress"}
        </Button>
        {fileName ? (
          <span className="min-w-0 break-all text-xs text-[var(--color-muted)]">
            {fileName}
          </span>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          aria-label="Выгрузка AliExpress"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void load(file);
          }}
        />
      </div>
      {analysis && !done ? (
        <p className="text-xs text-[var(--color-muted)]">
          Загрузка другого файла начнёт новый черновик без выбранных товаров.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </p>
      ) : null}
      {done ? (
        <section
          aria-label="Результат импорта"
          className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4"
        >
          <h2 className="font-semibold">Импорт завершён</h2>
          <p className="mt-2 text-sm">
            Создано компонентов: {done.created}. Обновлено позиций:{" "}
            {done.updated}. Без изменений: {done.unchanged}.
          </p>
          <ul className="mt-3 space-y-2">
            {[
              ...new Map(
                done.changes.map((change) => [change.componentId, change]),
              ).values(),
            ].map((change) => (
              <li key={change.componentId}>
                <Link
                  className="text-[var(--color-accent)] underline"
                  href={`/components/${change.componentId}`}
                >
                  {change.name}
                </Link>
              </li>
            ))}
          </ul>
          <Button
            className="mt-4"
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setAnalysis(await request<AliAnalysis>("analyze", data));
                setDone(null);
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Ошибка сравнения",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Вернуться к заказам
          </Button>
        </section>
      ) : preview && showPreview ? (
        <AliImportPreview
          preview={preview}
          busy={busy}
          onBack={closeStep}
          onApply={() => void apply()}
        />
      ) : analysis ? (
        <form onSubmit={review} className="flex flex-col gap-4">
          <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Поиск" htmlFor="ali-search">
                <Input
                  id="ali-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Товар, магазин, номер"
                />
              </Field>
              <Field label="Показать" htmlFor="ali-kind">
                <AliKindFilter
                  id="ali-kind"
                  value={kinds}
                  onChange={setKinds}
                  hiddenCount={displayRows.filter((row) => row.ignored).length}
                />
              </Field>
              <Field label="Заказы начиная с" htmlFor="ali-since">
                <Input
                  id="ali-since"
                  type="date"
                  value={since}
                  onChange={(e) => setSince(e.target.value)}
                />
              </Field>
            </div>
            <p className="text-sm text-[var(--color-muted)]">
              Всего заказов:{" "}
              {new Set(analysis.rows.map((row) => row.orderId)).size}. Показано
              товаров: {filtered.length}. Новые сверху. Выберите только нужное.
            </p>
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-[var(--color-muted)]">
                По этим условиям ничего не найдено
              </p>
            ) : null}
            {[...groups].map(([orderId, rows]) => {
              const first = rows[0];
              return (
                <section
                  key={orderId}
                  aria-label={`Заказ ${orderId}`}
                  className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]"
                >
                  <div className="flex items-start gap-3 bg-[var(--color-surface-2)] p-4">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0"
                      aria-label={`Выбрать показанные товары заказа ${orderId}`}
                      checked={rows.every((row) => Boolean(selected[row.id]))}
                      disabled={rows.every((row) => row.ignored)}
                      onChange={(e) => choose(rows, e.target.checked)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium break-words">
                        {first.store || "AliExpress"}
                      </p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {first.date} · {orderId}
                      </p>
                    </div>
                    {first.orderUrl ? (
                      <a
                        href={first.orderUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-sm text-[var(--color-accent)]"
                      >
                        Заказ ↗
                      </a>
                    ) : null}
                  </div>
                  {rows.map((row) => {
                    const draft = selected[row.id];
                    const component = analysis.components.find(
                      (item) =>
                        item.id ===
                        (draft?.componentId || row.binding?.componentId),
                    );
                    return (
                      <div
                        key={row.id}
                        className="border-t border-[var(--color-border)] p-4"
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 size-4 shrink-0"
                            aria-label={`Выбрать товар ${row.title} (${row.sku || row.orderId})`}
                            checked={Boolean(draft)}
                            disabled={row.ignored}
                            onChange={(e) => choose([row], e.target.checked)}
                          />
                          {row.imageUrl ? (
                            <img
                              src={row.imageUrl}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="size-14 shrink-0 rounded-lg bg-white object-contain"
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-medium">
                              {row.title}
                            </p>
                            {row.sku ? (
                              <p className="mt-1 break-words text-xs text-[var(--color-muted)]">
                                {row.sku}
                              </p>
                            ) : null}
                            <p className="mt-1 text-xs text-[var(--color-muted)]">
                              {row.quantity ?? "?"} уп. ·{" "}
                              {PURCHASE_LABELS[row.status]}
                            </p>
                            {row.trackingNumbers.length ? (
                              <p className="mt-1 break-all text-xs text-[var(--color-muted)]">
                                {row.trackingNumbers.join(", ")}
                              </p>
                            ) : null}
                            <span
                              className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs ${row.kind === "review" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-[var(--color-surface-2)] text-[var(--color-muted)]"}`}
                            >
                              {row.ignored ? "Скрыт" : KINDS[row.kind]}
                            </span>
                            {row.productUrl ? (
                              <a
                                href={row.productUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="ml-3 inline-block py-1 text-xs text-[var(--color-accent)] hover:underline"
                              >
                                Товар ↗
                              </a>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          {component ? (
                            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                              ✓ В каталоге компонентов
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--color-muted)]">
                              {row.ignored
                                ? "Не показывается при следующих импортах"
                                : "Ещё не связан с компонентом"}
                            </span>
                          )}
                          <button
                            type="button"
                            className="py-2 text-xs text-[var(--color-accent)]"
                            disabled={busy}
                            onClick={() => void visibility(row)}
                          >
                            {row.ignored
                              ? "Вернуть в импорт"
                              : "Больше не показывать"}
                          </button>
                        </div>
                        {component ? (
                          <div className="mt-2 max-w-56">
                            <ComponentCard item={component} newTab />
                          </div>
                        ) : draft?.componentDraft ? (
                          <div className="mt-2 max-w-56">
                            <ComponentCard
                              item={{
                                id: row.id,
                                data: {
                                  ...draft.componentDraft.data,
                                  purchases:
                                    draft.componentDraft.data.purchases?.map(
                                      (purchase) =>
                                        purchase.id === `ali-source-${row.id}`
                                          ? {
                                              ...purchase,
                                              quantity:
                                                draft.quantity === ""
                                                  ? undefined
                                                  : Number(draft.quantity),
                                              status: draft.status,
                                            }
                                          : purchase,
                                    ),
                                },
                                createdAt: "",
                                updatedAt: "",
                              }}
                              readOnly
                            />
                          </div>
                        ) : null}
                        {draft ? (
                          <div className="mt-4 flex flex-col gap-3">
                            {!row.binding ? (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() =>
                                    openWorkspace(row.id, "choose")
                                  }
                                >
                                  {component
                                    ? "Выбрать другой компонент"
                                    : "Выбрать из каталога"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => openWorkspace(row.id, "new")}
                                >
                                  {draft.componentDraft && !draft.componentId
                                    ? "Редактировать новую карточку"
                                    : "Создать новый компонент"}
                                </Button>
                              </div>
                            ) : null}
                            {component ? (
                              <Field
                                label="Покупка"
                                htmlFor={`purchase-${row.id}`}
                              >
                                <Select
                                  id={`purchase-${row.id}`}
                                  value={draft.purchaseId}
                                  disabled={Boolean(row.binding)}
                                  onChange={(e) => {
                                    const purchase = component.purchases.find(
                                      (p) => p.id === e.target.value,
                                    );
                                    edit(row.id, {
                                      purchaseId: e.target.value,
                                      unitsPerPack: String(
                                        purchase?.unitsPerPack ?? 1,
                                      ),
                                      quantity: String(
                                        purchase
                                          ? (purchase.quantity ?? "")
                                          : row.quantity == null
                                            ? ""
                                            : row.quantity,
                                      ),
                                      status: purchase?.status ?? row.status,
                                      quantityEdited: false,
                                      statusEdited: false,
                                    });
                                  }}
                                >
                                  <option value="">
                                    + Добавить новую покупку
                                  </option>
                                  {component.purchases
                                    .filter(
                                      (p) =>
                                        !p.aliOrderId ||
                                        (p.aliOrderId === row.orderId &&
                                          (!p.productUrl || p.productUrl === row.productUrl)),
                                    )
                                    .map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.order} · {p.quantity ?? "?"} шт. ·{" "}
                                        {PURCHASE_LABELS[p.status]}
                                      </option>
                                    ))}
                                </Select>
                              </Field>
                            ) : null}
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                              <Field
                                label="Штук в упаковке"
                                htmlFor={`pack-${row.id}`}
                              >
                                <Input
                                  id={`pack-${row.id}`}
                                  type="number"
                                  min={1}
                                  step={1}
                                  required
                                  value={draft.unitsPerPack}
                                  onChange={(e) =>
                                    edit(row.id, {
                                      unitsPerPack: e.target.value,
                                      ...(!draft.quantityEdited &&
                                      (!draft.purchaseId ||
                                        (row.binding &&
                                          !row.binding.quantityOverride))
                                        ? {
                                            quantity:
                                              row.quantity == null
                                                ? ""
                                                : String(
                                                    row.quantity *
                                                      Number(e.target.value),
                                                  ),
                                          }
                                        : {}),
                                    })
                                  }
                                />
                              </Field>
                              <Field
                                label="Всего, шт."
                                htmlFor={`quantity-${row.id}`}
                              >
                                <Input
                                  id={`quantity-${row.id}`}
                                  type="number"
                                  min={0}
                                  step={1}
                                  placeholder="Неизвестно"
                                  value={draft.quantity}
                                  onChange={(e) =>
                                    edit(row.id, {
                                      quantity: e.target.value,
                                      quantityEdited: true,
                                    })
                                  }
                                />
                              </Field>
                              <Field
                                label="Статус покупки"
                                htmlFor={`status-${row.id}`}
                              >
                                <Select
                                  id={`status-${row.id}`}
                                  value={draft.status}
                                  onChange={(e) =>
                                    edit(row.id, {
                                      status: e.target
                                        .value as Purchase["status"],
                                      statusEdited: true,
                                    })
                                  }
                                >
                                  {Object.entries(PURCHASE_LABELS).map(
                                    ([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    ),
                                  )}
                                </Select>
                              </Field>
                            </div>
                            {row.warnings.length ? (
                              <ul className="space-y-1 text-xs text-amber-600 dark:text-amber-400">
                                {row.warnings.map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            ) : null}
                            <Button
                              type="button"
                              disabled={
                                busy || savingVisibility ||
                                (!draft.componentId && !draft.componentDraft)
                              }
                              onClick={() => void applyRow(row)}
                            >
                              Применить этот товар
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </section>
              );
            })}
            <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div>
                <p className="text-sm font-medium" role="status">
                  Выбрано товаров: {count}
                </p>
                {count ? (
                  <button
                    type="button"
                    className="text-xs text-[var(--color-accent)]"
                    onClick={() => setSelected({})}
                  >
                    Снять выбор со всех
                  </button>
                ) : null}
              </div>
              <Button type="submit" disabled={busy || savingVisibility || count === 0}>
                {busy ? <Spinner /> : null}Проверить изменения
              </Button>
            </div>
          </fieldset>
        </form>
      ) : null}
    </div>
  );
}
