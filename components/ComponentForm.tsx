"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  COMPONENT_TYPES,
  type ComponentData,
  componentSaveSchema,
  type Logistics,
  type Purchase,
  type Usage,
} from "@/lib/schema";
import { ImageUploader } from "@/components/ImageUploader";
import { TagInput } from "@/components/TagInput";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { CloseComponentModal } from "@/components/ComponentModal";
import { DeleteComponentButton } from "@/components/DeleteComponentButton";
import { Button } from "@/components/ui/Button";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  Field,
  Input,
  Textarea,
} from "@/components/ui/Field";
import { CommentsEditor } from "@/components/CommentsEditor";
import {
  ComponentLedgerEditor,
  logisticsPatch,
} from "@/components/ComponentLedgerEditor";
import { Spinner } from "@/components/ui/states";
import { componentReturnTarget, saveComponentInBackground, updateSavedComponent } from "@/lib/component-list-state";

const FORM_ID = "component-form";

type Props = {
  id?: string; // если задан — режим редактирования
  initial?: Partial<ComponentData>;
  initialLogistics: Logistics;
  title: string;
  backHref: string;
  onSaveDraft?: (value: {
    data: ComponentData;
    logistics?: Logistics;
  }) => void | Promise<void>;
  onCancelDraft?: () => void;
  onDraftChange?: (value: ComponentFormDraft) => void;
  modal?: boolean;
};

type FormValues = {
  name: string;
  images: string[];
  inventory: ComponentData["inventory"];
  purchases: Purchase[];
  usages: Usage[];
  comments: ComponentData["comments"];
  history: ComponentData["history"];
  type: string;
  tags: string[];
  note: string;
  url: string;
};

function toComponentPayload({
  name,
  images,
  inventory,
  purchases,
  usages,
  comments,
  history,
  type,
  tags,
  note,
  url,
}: FormValues) {
  return {
    name,
    images,
    inventory,
    purchases,
    usages,
    comments,
    history,
    type: type === "" ? undefined : type,
    tags,
    note,
    url,
  };
}

function toSnapshot(payload: {
  data: ReturnType<typeof toComponentPayload>;
  logistics: Logistics;
}) {
  const parsed = componentSaveSchema.safeParse(payload);
  return JSON.stringify(parsed.success ? parsed.data : payload);
}

export type ComponentFormDraft = {
  data: ReturnType<typeof toComponentPayload>;
  logistics: Logistics;
};

export function ComponentForm({
  id,
  initial,
  initialLogistics,
  title,
  backHref,
  onSaveDraft,
  onCancelDraft,
  onDraftChange,
  modal = false,
}: Props) {
  const router = useRouter();
  const isEdit = Boolean(id);
  const returnTarget = backHref.startsWith("/projects")
    ? { href: backHref, scroll: true }
    : componentReturnTarget(`/components/${id}`, backHref);

  const [name, setName] = useState(initial?.name ?? "");
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [inventoryValue, setInventoryValue] = useState({
    inventory: initial?.inventory ?? [],
    history: initial?.history ?? [],
    purchases: initial?.purchases ?? [],
    usages: initial?.usages ?? [],
  });
  const [comments, setComments] = useState(initial?.comments ?? []);
  const [logistics, setLogistics] = useState(initialLogistics);
  const [type, setType] = useState<string>(initial?.type ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [note, setNote] = useState(initial?.note ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveStarted = useRef(false);

  const initialSnapshot = useMemo(
    () =>
      toSnapshot({
        data: toComponentPayload({
          name: initial?.name ?? "",
          images: initial?.images ?? [],
          inventory: initial?.inventory ?? [],
          purchases: initial?.purchases ?? [],
          usages: initial?.usages ?? [],
          history: initial?.history ?? [],
          comments: initial?.comments ?? [],
          type: initial?.type ?? "",
          tags: initial?.tags ?? [],
          note: initial?.note ?? "",
          url: initial?.url ?? "",
        }),
        logistics: { orders: [], shipments: [] },
      }),
    [initial],
  );
  const candidate = {
    data: toComponentPayload({
      name,
      images,
      ...inventoryValue,
      comments,
      type,
      tags,
      note,
      url,
    }),
    logistics: logisticsPatch(initialLogistics, logistics, inventoryValue),
  };
  const currentSnapshot = toSnapshot(candidate);
  const hasChanges = currentSnapshot !== initialSnapshot;

  // Сохраняем также незавершённый ввод, до валидации кнопкой «Сохранить».
  const draftSnapshot = onDraftChange
    ? JSON.stringify({ data: candidate.data, logistics })
    : null;
  useEffect(() => {
    if (draftSnapshot)
      onDraftChange?.(JSON.parse(draftSnapshot) as ComponentFormDraft);
  }, [draftSnapshot, onDraftChange]);

  // Подсказки для типа и тегов из существующих значений каталога.
  const [typeSuggestions, setTypeSuggestions] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/components/facets")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            types: { value: string }[];
            tags: { value: string }[];
          } | null,
        ) => {
          if (cancelled || !data) return;
          setTypeSuggestions(data.types.map((t) => t.value));
          setTagSuggestions(data.tags.map((t) => t.value));
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Объединённый список подсказок типа: каталог + предустановленные.
  const typeOptions = useMemo(() => {
    const set = new Set<string>([...typeSuggestions, ...COMPONENT_TYPES]);
    return Array.from(set);
  }, [typeSuggestions]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((!hasChanges && !onSaveDraft) || saving || saveStarted.current) return;
    setErrors({});
    setFormError(null);

    const parsed = componentSaveSchema.safeParse(candidate);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(
          issue.path[0] === "data"
            ? (issue.path[1] ?? "")
            : (issue.path[0] ?? ""),
        );
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      setFormError(
        parsed.error.issues.map((issue) => issue.message).join(". "),
      );
      return;
    }

    if (modal && id && !onSaveDraft) {
      saveStarted.current = true;
      saveComponentInBackground(id, parsed.data);
      router.back();
      return;
    }

    setSaving(true);
    try {
      if (onSaveDraft) {
        await onSaveDraft(parsed.data);
        return;
      }
      const res = await fetch(
        isEdit ? `/api/components/${id}` : "/api/components",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error ?? "Не удалось сохранить");
        return;
      }
      const saved = await res.json();
      updateSavedComponent(saved);
      router.push(returnTarget.href, { scroll: returnTarget.scroll });
      router.refresh();
    } catch (error) {
      setFormError(
        onSaveDraft && error instanceof Error
          ? error.message
          : "Сетевая ошибка. Попробуйте ещё раз.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AppHeader
        title={title}
        left={
          onCancelDraft ? (
            <button
              type="button"
              onClick={onCancelDraft}
              className="px-2 py-2 text-[var(--color-accent)]"
            >
              ‹ К импорту
            </button>
          ) : (
            modal ? <CloseComponentModal /> : <BackLink href={returnTarget.href} scroll={returnTarget.scroll} />
          )
        }
        right={
          <button
            type="submit"
            form={FORM_ID}
            disabled={saving || (!hasChanges && !onSaveDraft)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-[var(--color-accent)] transition active:opacity-70 disabled:opacity-40"
          >
            {saving ? <Spinner className="size-4" /> : "Готово"}
          </button>
        }
      />

      <div className="mx-auto max-w-xl px-4 py-5">
        <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
          <Field label="Название" htmlFor="name" error={errors.name}>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Резистор 10 кОм 0.25 Вт"
              required
            />
          </Field>

          <div>
            <p className="mb-1.5 text-sm font-medium text-[var(--color-muted)]">
              <span>Фотографии:&nbsp;</span>
              <span className="text-[var(--color-muted)]">
                {images.length} шт
              </span>
            </p>
            <ImageUploader value={images} onChange={setImages} />
            {errors.images ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.images}</p>
            ) : null}
          </div>

          <div>
            <Field
              label="Тип"
              htmlFor="type"
              error={errors.type}
              hint="Выберите или введите свой"
            >
              <div className="relative w-full">
                <Input
                  id="type"
                  list="type-options"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  placeholder=""
                  className="pr-9"
                />
                <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
              </div>
              <datalist id="type-options">
                {typeOptions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
          </div>

          <Field
            label="Теги"
            error={errors.tags}
            hint="Enter или запятая — добавить тег"
          >
            <TagInput
              value={tags}
              onChange={setTags}
              suggestions={tagSuggestions}
            />
          </Field>

          <div>
            <Field label="Ссылка на магазин" htmlFor="url" error={errors.url}>
              <div className="flex gap-2">
                <Input
                  id="url"
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  className="min-w-0 flex-1"
                />
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Открыть в магазине"
                    className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-[var(--color-muted)] transition hover:text-[var(--color-accent)]"
                  >
                    <ExternalLinkIcon className="size-4" />
                  </a>
                ) : null}
              </div>
            </Field>
          </div>

          <ComponentLedgerEditor
            value={inventoryValue}
            onChange={(value) =>
              setInventoryValue((previous) => ({ ...previous, ...value }))
            }
            logistics={logistics}
            initial={initialLogistics}
            onLogisticsChange={setLogistics}
          />

          <Field label="Заметка" htmlFor="note" error={errors.note}>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Корпус, точность, где лежит и т.п."
            />
          </Field>

          <section
            className="flex flex-col gap-3"
            aria-label="Комментарии к компоненту"
          >
            <h2 className="text-lg font-semibold">Комментарии к компоненту</h2>
            <CommentsEditor
              value={comments}
              onChange={setComments}
              label="компонент"
            />
          </section>

          {formError ? (
            <p className="text-sm text-red-400">{formError}</p>
          ) : null}

          <div>
            <Button
              type="submit"
              disabled={saving || (!hasChanges && !onSaveDraft)}
              className="w-full"
            >
              {saving ? (
                <Spinner />
              ) : onSaveDraft ? (
                "Готово — к импорту"
              ) : isEdit ? (
                "Сохранить"
              ) : (
                "Добавить"
              )}
            </Button>
          </div>
        </form>

        {isEdit && id ? (
          <div className="mt-5">
            <DeleteComponentButton id={id} backHref={backHref} modal={modal} />
          </div>
        ) : null}
      </div>
    </>
  );
}
