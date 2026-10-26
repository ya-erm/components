"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/schema";
import { ChevronLeftIcon, Input, ProjectsIcon } from "@/components/ui/Field";

export function ProjectPicker({
  projects,
  value,
  onChange,
  onCreate,
}: {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const selected = projects.find((project) => project.id === value);
  const matching = projects.filter((project) =>
    project.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      } else if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
          'button:not([disabled]), input:not([disabled])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={selected ? `Выбрать проект, сейчас ${selected.name || "Новый проект"}` : "Выбрать проект"}
        onClick={() => setOpen(true)}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg bg-[var(--color-surface-2)] px-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      >
        <ProjectsIcon className="size-5 shrink-0 text-[var(--color-accent)]" />
        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${selected ? "" : "text-[var(--color-muted)]"}`}>
          {selected ? selected.name || "Новый проект" : "Выбрать проект"}
        </span>
        <span aria-hidden="true" className="text-xl leading-none text-[var(--color-muted)]">›</span>
      </button>
      {open ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-picker-title"
          className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)] pt-[env(safe-area-inset-top)]"
        >
          <div className="flex h-14 shrink-0 items-center border-b border-[var(--color-border)] px-4">
            <button
              autoFocus
              type="button"
              aria-label="Назад к компоненту"
              onClick={close}
              className="-ml-2 flex size-11 items-center justify-center rounded-lg text-[var(--color-accent)]"
            >
              <ChevronLeftIcon className="size-6" />
            </button>
            <h2 id="project-picker-title" className="flex-1 pr-9 text-center font-semibold">
              Выбор проекта
            </h2>
          </div>
          <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-4 pb-[env(safe-area-inset-bottom)]">
            <Input
              aria-label="Найти проект"
              placeholder="Найти проект"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              className="my-4"
            />
            <div className="min-h-0 flex-1 overflow-y-auto" role="group" aria-label="Проекты">
              {matching.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  aria-pressed={project.id === value}
                  onClick={() => {
                    onChange(project.id);
                    close();
                  }}
                  className="flex min-h-16 w-full items-center gap-3 border-b border-[var(--color-border)] py-2 text-left"
                >
                  {project.images?.[0] ? (
                    <span className="relative size-10 shrink-0 overflow-hidden rounded-lg">
                      <Image src={project.images[0]} alt="" fill sizes="40px" className="object-cover" />
                    </span>
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)]">
                      <ProjectsIcon className="size-5 text-[var(--color-muted)]" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">{project.name || "Новый проект"}</span>
                  {project.id === value ? (
                    <span aria-label="Выбран" className="text-xl text-[var(--color-accent)]">✓</span>
                  ) : null}
                </button>
              ))}
              {!matching.length ? (
                <p className="py-6 text-center text-sm text-[var(--color-muted)]">Проекты не найдены.</p>
              ) : null}
            </div>
            <button
              type="button"
              className="my-3 min-h-11 shrink-0 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-accent)]"
              onClick={() => {
                onCreate();
                close();
              }}
            >
              + Новый проект
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
