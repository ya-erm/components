"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { projectSchema, type Project } from "@/lib/schema";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { ImageUploader } from "@/components/ImageUploader";
import { ProjectDescription } from "@/components/ProjectDescription";

export function ProjectForm({ initial }: { initial?: Project }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [images, setImages] = useState(initial?.images ?? []);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || uploading) return;
    setError(null);
    const parsed = projectSchema.safeParse({
      id: initial?.id ?? crypto.randomUUID(),
      name,
      description,
      images,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        initial
          ? `/api/projects/${encodeURIComponent(initial.id)}`
          : "/api/projects",
        {
          method: initial ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Не удалось сохранить проект");
      router.push(`/projects/${encodeURIComponent(result.id)}`);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Не удалось сохранить проект",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset disabled={saving} className="flex min-w-0 flex-col gap-5">
        <Field label="Название проекта" htmlFor="project-name">
          <Input
            id="project-name"
            required
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field
          label="Описание"
          htmlFor="project-description"
          hint="Markdown: **жирный**, списки, [текст ссылки](https://example.com). Обычные ссылки тоже кликабельны."
        >
          <Textarea
            id="project-description"
            rows={8}
            maxLength={20000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <button
          type="button"
          aria-expanded={preview}
          onClick={() => setPreview(!preview)}
          className="self-start text-sm text-[var(--color-accent)]"
        >
          {preview ? "Скрыть предпросмотр" : "Предпросмотр описания"}
        </button>
        {preview ? (
          <div className="rounded-xl border border-[var(--color-border)] p-3">
            {description ? (
              <ProjectDescription text={description} />
            ) : (
              <p className="text-sm text-[var(--color-muted)]">
                Пока нет описания.
              </p>
            )}
          </div>
        ) : null}
        <div>
          <h2 className="mb-2 text-sm font-medium text-[var(--color-muted)]">
            Фотографии проекта
          </h2>
          <ImageUploader
            value={images}
            onChange={setImages}
            onUploadingChange={setUploading}
          />
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Первое фото — обложка карточки проекта.
          </p>
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || uploading}>
          {saving
            ? "Сохранение…"
            : uploading
              ? "Загрузка фото…"
              : "Сохранить проект"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving || uploading}
          onClick={() => router.back()}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
