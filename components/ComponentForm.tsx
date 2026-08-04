"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  COMPONENT_STATUSES,
  COMPONENT_TYPES,
  ComponentData,
  MAX_IMAGES,
  STATUS_LABELS,
  componentDataSchema,
} from "@/lib/schema";
import { ImageUploader } from "@/components/ImageUploader";
import { TagInput } from "@/components/TagInput";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { DeleteComponentButton } from "@/components/DeleteComponentButton";
import { Button } from "@/components/ui/Button";
import { ChevronDownIcon, ExternalLinkIcon, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/states";

const FORM_ID = "component-form";

type Props = {
  id?: string; // если задан — режим редактирования
  initial?: Partial<ComponentData>;
  title: string;
  backHref: string;
};

type FormValues = {
  name: string;
  images: string[];
  quantity: string;
  status: string;
  type: string;
  tags: string[];
  note: string;
  url: string;
};

function toComponentPayload({
  name,
  images,
  quantity,
  status,
  type,
  tags,
  note,
  url,
}: FormValues) {
  return {
    name,
    images,
    quantity: quantity === "" ? undefined : quantity,
    status: status === "" ? undefined : status,
    type: type === "" ? undefined : type,
    tags,
    note,
    url,
  };
}

function toSnapshot(payload: ReturnType<typeof toComponentPayload>) {
  const parsed = componentDataSchema.safeParse(payload);
  return JSON.stringify(parsed.success ? parsed.data : payload);
}

export function ComponentForm({ id, initial, title, backHref }: Props) {
  const router = useRouter();
  const isEdit = Boolean(id);

  const [name, setName] = useState(initial?.name ?? "");
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [quantity, setQuantity] = useState(
    initial?.quantity != null ? String(initial.quantity) : "",
  );
  const [status, setStatus] = useState<string>(initial?.status ?? "");
  const [type, setType] = useState<string>(initial?.type ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [note, setNote] = useState(initial?.note ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const initialSnapshot = useMemo(
    () =>
      toSnapshot(
        toComponentPayload({
          name: initial?.name ?? "",
          images: initial?.images ?? [],
          quantity: initial?.quantity != null ? String(initial.quantity) : "",
          status: initial?.status ?? "",
          type: initial?.type ?? "",
          tags: initial?.tags ?? [],
          note: initial?.note ?? "",
          url: initial?.url ?? "",
        }),
      ),
    [initial],
  );
  const candidate = toComponentPayload({ name, images, quantity, status, type, tags, note, url });
  const currentSnapshot = toSnapshot(candidate);
  const hasChanges = currentSnapshot !== initialSnapshot;

  // Подсказки для типа и тегов из существующих значений каталога.
  const [typeSuggestions, setTypeSuggestions] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/components/facets")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { types: { value: string }[]; tags: { value: string }[] } | null) => {
        if (cancelled || !data) return;
        setTypeSuggestions(data.types.map((t) => t.value));
        setTagSuggestions(data.tags.map((t) => t.value));
      })
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
    if (!hasChanges || saving) return;
    setErrors({});
    setFormError(null);

    const parsed = componentDataSchema.safeParse(candidate);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(isEdit ? `/api/components/${id}` : "/api/components", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error ?? "Не удалось сохранить");
        return;
      }
      await res.json();
      router.push(backHref);
      router.refresh();
    } catch {
      setFormError("Сетевая ошибка. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AppHeader
        title={title}
        left={<BackLink href={backHref} />}
        right={
          <button
            type="submit"
            form={FORM_ID}
            disabled={saving || !hasChanges}
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
        <span className="text-[var(--color-muted)]">{images.length} шт</span>
      </p>
        <ImageUploader value={images} onChange={setImages} />
        {errors.images ? <p className="mt-1.5 text-sm text-red-400">{errors.images}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Тип" htmlFor="type" error={errors.type} hint="Выберите или введите свой">
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

        <Field label="Статус" htmlFor="status" error={errors.status}>
          <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Не указан</option>
            {COMPONENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Теги" error={errors.tags} hint="Enter или запятая — добавить тег">
        <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
      </Field>

      <div className="grid grid-cols-[1fr_3fr] gap-4">
        <Field label="Количество" htmlFor="quantity" error={errors.quantity}>
          <Input
            id="quantity"
            type="number"
            inputMode="numeric"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
          />
        </Field>

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

      <Field label="Заметка" htmlFor="note" error={errors.note}>
        <Textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Корпус, точность, где лежит и т.п."
        />
      </Field>

          {formError ? <p className="text-sm text-red-400">{formError}</p> : null}

          <div>
            <Button type="submit" disabled={saving || !hasChanges} className="w-full">
              {saving ? <Spinner /> : isEdit ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </form>

        {isEdit && id ? (
          <div className="mt-5">
            <DeleteComponentButton id={id} />
          </div>
        ) : null}
      </div>
    </>
  );
}
