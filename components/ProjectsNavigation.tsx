"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ProjectsIcon } from "@/components/ui/Field";

let openedFromComponents = false;

export function ProjectsLink() {
  return (
    <Link
      href="/projects"
      prefetch
      aria-label="Проекты"
      onClick={(event) => {
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey)
          openedFromComponents = true;
      }}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[var(--color-accent)] transition hover:bg-[var(--color-surface-2)] active:opacity-70"
    >
      <ProjectsIcon className="size-5 shrink-0" />
      <span className="hidden sm:inline">Проекты</span>
    </Link>
  );
}

export function ProjectsBackLink() {
  const router = useRouter();
  return (
    <Link
      href="/components"
      onClick={(event) => {
        if (!openedFromComponents || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        openedFromComponents = false;
        router.back();
      }}
      className="-ml-1 inline-flex items-center gap-0.5 rounded-lg py-1 pr-2 pl-1 text-[var(--color-accent)] transition active:opacity-70"
    >
      <ChevronLeftIcon className="size-5 shrink-0" />
      <span className="truncate">Назад</span>
    </Link>
  );
}
