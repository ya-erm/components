"use client";

import { useState } from "react";
import type { Project } from "@/lib/schema";
import { ProjectCard } from "@/components/ProjectCard";
import { Input } from "@/components/ui/Field";

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
  const selected = projects.find((project) => project.id === value);
  const matching = projects.filter((project) =>
    project.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-label="Выбрать проект"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="w-full rounded-xl border border-[var(--color-border)] p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      >
        {selected ? (
          <ProjectCard project={selected} />
        ) : (
          <span>Выберите проект</span>
        )}
        <span className="mt-2 block text-xs text-[var(--color-accent)]">
          {open ? "Свернуть" : selected ? "Изменить проект" : "Открыть список"}
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] p-2">
          <Input
            aria-label="Найти проект"
            placeholder="Найти проект"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div
            className="flex max-h-80 flex-col gap-2 overflow-y-auto"
            role="group"
            aria-label="Проекты"
          >
            {matching.map((project) => (
              <button
                key={project.id}
                type="button"
                aria-pressed={project.id === value}
                onClick={() => {
                  onChange(project.id);
                  setOpen(false);
                  setQuery("");
                }}
                className={`rounded-lg border p-2 text-left ${project.id === value ? "border-[var(--color-accent)] bg-[var(--color-surface-2)]" : "border-[var(--color-border)]"}`}
              >
                <ProjectCard project={project} />
              </button>
            ))}
            {!matching.length ? (
              <p className="p-2 text-sm text-[var(--color-muted)]">
                Проекты не найдены.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="p-2 text-left text-sm text-[var(--color-accent)]"
            onClick={() => {
              onCreate();
              setOpen(false);
              setQuery("");
            }}
          >
            + Новый проект
          </button>
        </div>
      ) : null}
    </div>
  );
}
