"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { MAX_FILE_SIZE, MAX_IMAGES } from "@/lib/schema";
import { Spinner } from "@/components/ui/states";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

export function ImageUploader({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);

    const files = Array.from(fileList);
    if (value.length + files.length > MAX_IMAGES) {
      setError(`Максимум ${MAX_IMAGES} изображений`);
      return;
    }
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        setError(`Файл "${f.name}" больше 4.5 МБ`);
        return;
      }
    }

    setUploading(true);
    try {
      // Льём по одному файлу — на Vercel тело запроса ограничено ~4.5 МБ.
      const uploaded: string[] = [];
      for (const f of files) {
        const form = new FormData();
        form.append("files", f);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Ошибка загрузки");
        }
        const data: { urls: string[] } = await res.json();
        uploaded.push(...data.urls);
      }
      onChange([...value, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  function makeMain(i: number) {
    if (i === 0) return;
    const next = [...value];
    const [picked] = next.splice(i, 1);
    next.unshift(picked);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((url, i) => (
            <li
              key={url}
              className="relative aspect-square overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]"
            >
              <Image src={url} alt="" fill sizes="120px" className="object-cover" />

              {i === 0 ? (
                <span className="absolute left-1 top-1 rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Главное
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Удалить"
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
              >
                ×
              </button>

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 px-1 py-1 text-white">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Левее"
                  className="px-1 disabled:opacity-30"
                >
                  ←
                </button>
                {i !== 0 ? (
                  <button
                    type="button"
                    onClick={() => makeMain(i)}
                    className="text-[10px] underline-offset-2 hover:underline"
                  >
                    сделать главным
                  </button>
                ) : (
                  <span className="text-[10px] opacity-60">—</span>
                )}
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === value.length - 1}
                  aria-label="Правее"
                  className="px-1 disabled:opacity-30"
                >
                  →
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || value.length >= MAX_IMAGES}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-4 text-sm text-[var(--color-muted)] transition hover:text-[var(--color-fg)] disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Spinner /> Загрузка…
            </>
          ) : (
            <>📷 Добавить фото ({value.length}/{MAX_IMAGES})</>
          )}
        </button>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
