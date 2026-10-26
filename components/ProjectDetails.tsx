"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { projectSchema, type Project } from "@/lib/schema";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { ImageUploader } from "@/components/ImageUploader";
import { ProjectDescription } from "@/components/ProjectDescription";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/states";

const FORM_ID = "project-details-form";

export function ProjectDetails({
  initial,
  children,
}: {
  initial?: Project;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [draftId] = useState(() => crypto.randomUUID());
  const [saved, setSaved] = useState<Project | null>(initial ?? null);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [images, setImages] = useState(initial?.images ?? []);
  const [editingName, setEditingName] = useState(!initial);
  const [editingDescription, setEditingDescription] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    !saved ||
    name !== saved.name ||
    description !== (saved.description ?? "") ||
    JSON.stringify(images) !== JSON.stringify(saved.images ?? []);

  function reset(project: Project) {
    setName(project.name);
    setDescription(project.description ?? "");
    setImages(project.images ?? []);
    setEditingName(false);
    setEditingDescription(false);
    setPreview(false);
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || uploading || !dirty) return;
    setError(null);
    const parsed = projectSchema.safeParse({
      id: saved?.id ?? draftId,
      name,
      description,
      images,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    let created = false;
    try {
      const response = await fetch(
        saved ? `/api/projects/${encodeURIComponent(saved.id)}` : "/api/projects",
        {
          method: saved ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Не удалось сохранить проект");
      if (!saved) {
        created = true;
        router.replace(`/projects/${encodeURIComponent(result.id)}`);
        return;
      }
      setSaved(result);
      reset(result);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Не удалось сохранить проект",
      );
    } finally {
      if (!created) setSaving(false);
    }
  }

  return (
    <>
      <AppHeader
        title={saved?.name || "Новый проект"}
        left={<BackLink href="/projects" />}
        right={
          <button
            type="submit"
            form={FORM_ID}
            disabled={!dirty || saving || uploading}
            className="inline-flex min-h-11 items-center rounded-lg px-2 font-medium text-[var(--color-accent)] disabled:opacity-40"
          >
            {saving ? <Spinner className="size-4" /> : "Готово"}
          </button>
        }
      />
      <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-5">
        <form
          id={FORM_ID}
          onSubmit={submit}
          className="flex flex-col gap-5"
          aria-label="Данные проекта"
        >
          <fieldset disabled={saving} className="flex min-w-0 flex-col gap-5">
            {editingName ? (
              <div className="flex items-start gap-2">
                <Input
                  aria-label="Название проекта"
                  autoFocus
                  required
                  maxLength={200}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="text-2xl font-semibold"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingName(false)}
                >
                  Готово
                </Button>
              </div>
            ) : (
              <h1 className="min-w-0 text-2xl font-semibold">
                <button
                  type="button"
                  aria-label="Изменить название проекта"
                  onClick={() => setEditingName(true)}
                  className="group flex w-full items-center gap-2 rounded-lg text-left"
                >
                  <span className="min-w-0 break-words">
                    {name || "Название проекта"}
                  </span>
                  <EditIcon className="size-5 shrink-0 text-[var(--color-muted)] group-hover:text-[var(--color-accent)]" />
                </button>
              </h1>
            )}
            <div>
              <ImageUploader
                value={images}
                onChange={setImages}
                onUploadingChange={setUploading}
              />
            </div>
            <section
              aria-label="Описание проекта"
              className="flex flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium text-[var(--color-muted)]">
                  Описание
                </h2>
                <button
                  type="button"
                  aria-label={
                    editingDescription
                      ? "Готово: описание проекта"
                      : "Изменить описание проекта"
                  }
                  onClick={() => {
                    setEditingDescription(!editingDescription);
                    setPreview(false);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-[var(--color-accent)]"
                >
                  {editingDescription ? (
                    "Готово"
                  ) : (
                    <>
                      <EditIcon className="size-4" />
                      Изменить
                    </>
                  )}
                </button>
              </div>
              {editingDescription ? (
                <>
                  <Textarea
                    aria-label="Описание"
                    autoFocus
                    rows={8}
                    maxLength={20000}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                  <p className="text-xs text-[var(--color-muted)]">
                    Markdown: **жирный**, списки, [текст
                    ссылки](https://example.com).
                  </p>
                  <button
                    type="button"
                    aria-expanded={preview}
                    onClick={() => setPreview(!preview)}
                    className="self-start text-sm text-[var(--color-accent)]"
                  >
                    {preview ? "Скрыть предпросмотр" : "Предпросмотр описания"}
                  </button>
                  {preview && description ? (
                    <ProjectDescription text={description} />
                  ) : null}
                </>
              ) : description ? (
                <ProjectDescription text={description} />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDescription(true)}
                  className="self-start rounded-lg text-sm text-[var(--color-accent)]"
                >
                  Добавить описание
                </button>
              )}
            </section>
          </fieldset>
          {error ? (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          ) : null}
          {dirty || uploading ? (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving || uploading}>
                {saving
                  ? "Сохранение…"
                  : uploading
                    ? "Загрузка фото…"
                    : "Сохранить"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={saving || uploading}
                onClick={() => saved ? reset(saved) : router.push("/projects")}
              >
                Отмена
              </Button>
            </div>
          ) : null}
        </form>
        {children ?? (
          <section aria-label="Компоненты проекта">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Компоненты проекта</h2>
              <Button type="button" variant="secondary" disabled>Выбрать компоненты</Button>
            </div>
            <p className="text-sm text-[var(--color-muted)]">
              Сохраните проект, чтобы выбрать компоненты.
            </p>
          </section>
        )}
      </div>
    </>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="m12.5 3.5 4 4M3.5 16.5l4.2-1 9-9a1.4 1.4 0 0 0 0-2l-1.2-1.2a1.4 1.4 0 0 0-2 0l-9 9-1 4.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
