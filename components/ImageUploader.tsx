"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
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
  const viewerScrollerRef = useRef<HTMLDivElement>(null);
  const viewerThumbsRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const gestureStartX = useRef<number | null>(null);
  const gestureStartY = useRef<number | null>(null);
  const shouldSyncViewerScroll = useRef(false);
  const programmaticViewerTarget = useRef<number | null>(null);
  const programmaticScrollReset = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewerOpen = viewerIndex != null && value.length > 0;
  const canAdd = value.length < MAX_IMAGES;
  const canGoPrev = viewerIndex != null && viewerIndex > 0;
  const canGoNext = viewerIndex != null && viewerIndex < value.length - 1;

  useEffect(() => {
    if (viewerIndex == null && deleteIndex == null) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (deleteIndex != null) {
          setDeleteIndex(null);
          return;
        }
        if (optionsOpen) {
          setOptionsOpen(false);
          return;
        }
        closeViewer();
      }
      if (viewerIndex != null && event.key === "ArrowLeft") {
        event.preventDefault();
        goToViewerImage(-1);
      }
      if (viewerIndex != null && event.key === "ArrowRight") {
        event.preventDefault();
        goToViewerImage(1);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [deleteIndex, optionsOpen, value.length, viewerIndex]);

  useEffect(() => {
    if (viewerIndex != null && viewerIndex >= value.length) {
      setViewerIndex(value.length > 0 ? value.length - 1 : null);
    }
    if (deleteIndex != null && deleteIndex >= value.length) {
      setDeleteIndex(null);
    }
  }, [deleteIndex, value.length, viewerIndex]);

  useEffect(() => {
    setOptionsOpen(false);
  }, [viewerIndex]);

  useEffect(() => {
    return () => clearProgrammaticViewerScroll();
  }, []);

  useEffect(() => {
    if (viewerIndex == null) return;

    const selectedThumb = viewerThumbsRef.current?.querySelector(
      `[data-viewer-thumb="${viewerIndex}"]`,
    );
    selectedThumb?.scrollIntoView({ block: "nearest", inline: "center" });

    if (!shouldSyncViewerScroll.current) return;
    shouldSyncViewerScroll.current = false;
    requestAnimationFrame(() => scrollViewerToIndex(viewerIndex, "auto"));
  }, [viewerIndex]);

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
    setDeleteIndex(null);
    setOptionsOpen(false);
    shouldSyncViewerScroll.current = true;
    setViewerIndex((current) => {
      if (current == null) return null;
      if (value.length <= 1) return null;
      if (current > i) return current - 1;
      return Math.min(current, value.length - 2);
    });
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    shouldSyncViewerScroll.current = true;
    setViewerIndex(j);
    setOptionsOpen(false);
  }

  function makeMain(i: number) {
    if (i === 0) return;
    const next = [...value];
    const [picked] = next.splice(i, 1);
    next.unshift(picked);
    onChange(next);
    shouldSyncViewerScroll.current = true;
    setViewerIndex(0);
    setOptionsOpen(false);
  }

  function openInput() {
    if (!uploading && canAdd) inputRef.current?.click();
  }

  function openViewer(i: number) {
    shouldSyncViewerScroll.current = true;
    setViewerIndex(i);
  }

  function closeViewer() {
    setOptionsOpen(false);
    setViewerIndex(null);
    gestureStartX.current = null;
    gestureStartY.current = null;
    clearProgrammaticViewerScroll();
  }

  function scrollViewerToIndex(i: number, behavior: ScrollBehavior = "smooth") {
    const scroller = viewerScrollerRef.current;
    if (!scroller) {
      clearProgrammaticViewerScroll();
      return;
    }
    if (programmaticScrollReset.current) {
      clearTimeout(programmaticScrollReset.current);
    }
    programmaticViewerTarget.current = i;
    programmaticScrollReset.current = setTimeout(
      () => {
        if (programmaticViewerTarget.current === i) {
          programmaticViewerTarget.current = null;
        }
        programmaticScrollReset.current = null;
      },
      behavior === "smooth" ? 900 : 80,
    );
    scroller.scrollTo({ left: scroller.clientWidth * i, behavior });
  }

  function selectViewerImage(i: number, behavior: ScrollBehavior = "smooth") {
    const next = Math.max(0, Math.min(value.length - 1, i));
    shouldSyncViewerScroll.current = false;
    setViewerIndex(next);
    setOptionsOpen(false);
    requestAnimationFrame(() => scrollViewerToIndex(next, behavior));
  }

  function goToViewerImage(dir: -1 | 1) {
    if (viewerIndex == null) return;
    selectViewerImage(viewerIndex + dir);
  }

  function requestDelete(i: number) {
    setOptionsOpen(false);
    setDeleteIndex(i);
  }

  function downloadCurrentImage() {
    if (viewerIndex == null) return;

    const url = value[viewerIndex];
    setOptionsOpen(false);
    triggerDownload(`/api/images/download?url=${encodeURIComponent(url)}`);
  }

  function triggerDownload(href: string) {
    const link = document.createElement("a");
    link.href = href;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
  }

  function clearProgrammaticViewerScroll() {
    programmaticViewerTarget.current = null;
    if (programmaticScrollReset.current) {
      clearTimeout(programmaticScrollReset.current);
      programmaticScrollReset.current = null;
    }
  }

  function onViewerPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    clearProgrammaticViewerScroll();
    gestureStartX.current = event.clientX;
    gestureStartY.current = event.clientY;
  }

  function onViewerPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    if (gestureStartX.current == null || gestureStartY.current == null) return;

    const dx = event.clientX - gestureStartX.current;
    const dy = event.clientY - gestureStartY.current;
    gestureStartX.current = null;
    gestureStartY.current = null;

    if (dy > 90 && dy > Math.abs(dx) * 1.35) {
      closeViewer();
    }
  }

  function onViewerScroll() {
    const scroller = viewerScrollerRef.current;
    if (!scroller || scroller.clientWidth === 0) return;

    const target = programmaticViewerTarget.current;
    if (target != null) {
      const distanceToTarget = Math.abs(scroller.scrollLeft - scroller.clientWidth * target);
      if (distanceToTarget > Math.max(2, scroller.clientWidth * 0.02)) return;
      clearProgrammaticViewerScroll();
      return;
    }

    const next = Math.round(scroller.scrollLeft / scroller.clientWidth);
    if (next >= 0 && next < value.length && next !== viewerIndex) {
      setViewerIndex(next);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="h-32 overflow-x-auto rounded-xl sm:h-36">
        <ul className="flex h-full min-w-0 gap-2 pb-1">
          {value.map((url, i) => (
            <li
              key={`${url}-${i}`}
              className="relative aspect-square h-full shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]"
            >
              <button
                type="button"
                onClick={() => openViewer(i)}
                className="relative block h-full w-full"
                aria-label={`Открыть фото ${i + 1}`}
              >
                <Image
                  src={url}
                  alt=""
                  fill
                  sizes="144px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}

          <li className="aspect-square h-full shrink-0">
            <button
              type="button"
              onClick={openInput}
              disabled={uploading || !canAdd}
              aria-label="Добавить фото"
              className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)] transition hover:text-[var(--color-fg)] disabled:opacity-50"
            >
              {uploading ? <Spinner /> : <PlusIcon className="size-7" />}
            </button>
          </li>
        </ul>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {deleteIndex != null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-photo-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xl">
            <p id="delete-photo-title" className="text-base font-medium">Удалить фото?</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Это действие нельзя отменить.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteIndex(null)}
                className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm font-medium"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => remove(deleteIndex)}
                className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {viewerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр фотографий"
          className="fixed inset-0 z-40 flex select-none flex-col bg-black/95 text-white"
          onPointerDown={onViewerPointerDown}
          onPointerUp={onViewerPointerUp}
          onPointerCancel={() => {
            gestureStartX.current = null;
            gestureStartY.current = null;
          }}
        >
          {optionsOpen ? (
            <button
              type="button"
              aria-label="Закрыть меню действий"
              className="absolute inset-0 z-30 cursor-default"
              onClick={() => setOptionsOpen(false)}
            />
          ) : null}

          <div className="pointer-events-none absolute inset-x-0 top-0 z-40">
            <button
              type="button"
              onClick={closeViewer}
              aria-label="Закрыть просмотр"
              className="pointer-events-auto absolute left-[calc(env(safe-area-inset-left)+0.75rem)] top-[calc(env(safe-area-inset-top)+0.75rem)] flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
            >
              <CloseIcon className="size-5" />
            </button>

            <button
              type="button"
              onClick={() => setOptionsOpen((open) => !open)}
              aria-label="Действия с фото"
              aria-expanded={optionsOpen}
              className="pointer-events-auto absolute right-[calc(env(safe-area-inset-right)+0.75rem)] top-[calc(env(safe-area-inset-top)+0.75rem)] flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
            >
              <DotsIcon className="size-5" />
            </button>

            {optionsOpen ? (
              <div className="pointer-events-auto absolute right-[calc(env(safe-area-inset-right)+0.75rem)] top-[calc(env(safe-area-inset-top)+3.5rem)] w-56 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/95 py-1 text-sm text-white shadow-2xl backdrop-blur">
                {viewerIndex !== 0 ? (
                  <MenuButton
                    icon={<StarIcon className="size-4" />}
                    onClick={() => makeMain(viewerIndex!)}
                  >
                    Сделать основным
                  </MenuButton>
                ) : null}
                {canGoPrev ? (
                  <MenuButton
                    icon={<ArrowLeftIcon className="size-4" />}
                    onClick={() => move(viewerIndex!, -1)}
                  >
                    Переместить влево
                  </MenuButton>
                ) : null}
                {canGoNext ? (
                  <MenuButton
                    icon={<ArrowRightIcon className="size-4" />}
                    onClick={() => move(viewerIndex!, 1)}
                  >
                    Переместить вправо
                  </MenuButton>
                ) : null}
                <MenuButton
                  icon={<DownloadIcon className="size-4" />}
                  onClick={downloadCurrentImage}
                >
                  Скачать
                </MenuButton>
                <MenuButton
                  icon={<TrashIcon className="size-4" />}
                  danger
                  onClick={() => requestDelete(viewerIndex!)}
                >
                  Удалить
                </MenuButton>
              </div>
            ) : null}
          </div>

          <div className="relative min-h-0 flex-1">
            <div
              ref={viewerScrollerRef}
              onScroll={onViewerScroll}
              className="h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="flex h-full">
                {value.map((url, i) => (
                  <div
                    key={`viewer-slide-${url}-${i}`}
                    className="flex h-full min-w-full snap-center pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]"
                  >
                    <div className="relative h-full w-full">
                      <Image
                        src={url}
                        alt=""
                        fill
                        sizes="100vw"
                        className="object-contain"
                        priority={i === viewerIndex}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          <div className="z-20 flex shrink-0 items-center justify-center gap-3 px-4 pt-2">
            <button
              type="button"
              onClick={() => goToViewerImage(-1)}
              disabled={!canGoPrev}
              aria-label="Предыдущее фото"
              className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"
            >
              <ArrowLeftIcon className="size-5" />
            </button>
            <div className="inline-flex h-9 min-w-14 items-center justify-center rounded-full bg-white/10 px-3 text-center text-xs font-medium text-white/80 backdrop-blur">
              {viewerIndex! + 1}/{value.length}
            </div>
            <button
              type="button"
              onClick={() => goToViewerImage(1)}
              disabled={!canGoNext}
              aria-label="Следующее фото"
              className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"
            >
              <ArrowRightIcon className="size-5" />
            </button>
          </div>

          {value.length > 1 ? (
            <div
              ref={viewerThumbsRef}
              className="z-20 h-[calc(5rem+env(safe-area-inset-bottom))] shrink-0 overflow-x-auto pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pl-[calc(env(safe-area-inset-left)+0.75rem)] pr-[calc(env(safe-area-inset-right)+0.75rem)] pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="flex h-full w-max min-w-full justify-center gap-2">
                {value.map((url, i) => (
                  <button
                    key={`viewer-thumb-${url}-${i}`}
                    type="button"
                    data-viewer-thumb={i}
                    onClick={() => selectViewerImage(i)}
                    aria-label={`Перейти к фото ${i + 1}`}
                    className={`relative aspect-square h-full shrink-0 overflow-hidden rounded-lg border transition ${
                      i === viewerIndex ? "border-white opacity-100" : "border-white/20 opacity-55"
                    }`}
                  >
                    <Image src={url} alt="" fill sizes="64px" className="object-cover" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuButton({
  children,
  danger = false,
  disabled = false,
  icon,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition disabled:pointer-events-none disabled:text-white/30 ${
        danger ? "text-red-400 hover:bg-red-500/10" : "text-white hover:bg-white/10"
      }`}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12.5 4.5 7 10l5.5 5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M7.5 4.5 13 10l-5.5 5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DotsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <circle cx="5" cy="10" r="1.4" fill="currentColor" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" />
      <circle cx="15" cy="10" r="1.4" fill="currentColor" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M10 3.5v8m0 0 3-3m-3 3-3-3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 13.5v1.2a1.8 1.8 0 0 0 1.8 1.8h7.4a1.8 1.8 0 0 0 1.8-1.8v-1.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="m5 5 10 10M15 5 5 15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M10 4.5v11M4.5 10h11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="m10 3.5 1.9 4 4.4.6-3.2 3.1.8 4.4-3.9-2.1-3.9 2.1.8-4.4-3.2-3.1 4.4-.6L10 3.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4.5 6h11M8 6V4.8A1.3 1.3 0 0 1 9.3 3.5h1.4A1.3 1.3 0 0 1 12 4.8V6m2.2 0-.5 9A1.5 1.5 0 0 1 12.2 16.5H7.8A1.5 1.5 0 0 1 6.3 15l-.5-9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
