import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { currentUserId } from "@/lib/session";
import { listComponents } from "@/lib/components-repo";
import { ComponentGrid } from "@/components/ComponentGrid";
import { AppHeader } from "@/components/AppHeader";
import { PullToRefresh } from "@/components/PullToRefresh";
import { GearIcon, PlusIcon, ProjectsIcon } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/states";

export const dynamic = "force-dynamic";

type ViewMode = "grid" | "compact" | "list";
type CollapsedGroupsByGroup = { type: string[]; tag: string[] };

const VIEW_MODE_COOKIE_NAME = "components-view-mode";
const COLLAPSED_GROUPS_COOKIE_PREFIX = "components-collapsed-groups";

export default async function ComponentsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ownerId = await currentUserId();
  if (!ownerId) redirect("/login");

  const cookieStore = await cookies();
  const initialViewMode = parseViewMode(cookieStore.get(VIEW_MODE_COOKIE_NAME)?.value);
  const initialCollapsedGroups: CollapsedGroupsByGroup = {
    type: parseCollapsedGroupsCookie(cookieStore.get(`${COLLAPSED_GROUPS_COOKIE_PREFIX}-type`)?.value),
    tag: parseCollapsedGroupsCookie(cookieStore.get(`${COLLAPSED_GROUPS_COOKIE_PREFIX}-tag`)?.value),
  };
  const filters = await searchParams;
  const initial = await listComponents({
    ownerId,
    all: true,
    query: firstParam(filters.q),
    status: firstParam(filters.status),
    type: firstParam(filters.type),
    tag: firstParam(filters.tag),
  });

  return (
    <>
      <AppHeader
        title="Компоненты"
        left={
          <div className="flex items-center gap-1">
          <Link
            href="/settings"
            aria-label="Настройки"
            className="-ml-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[var(--color-accent)] transition hover:bg-[var(--color-surface-2)] active:opacity-70"
          >
            <GearIcon className="size-5 shrink-0" />
            <span className="hidden sm:inline">Настройки</span>
          </Link>
          <Link
            href="/projects"
            aria-label="Проекты"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[var(--color-accent)] transition hover:bg-[var(--color-surface-2)] active:opacity-70"
          >
            <ProjectsIcon className="size-5 shrink-0" />
            <span className="hidden sm:inline">Проекты</span>
          </Link>
          </div>
        }
        right={
          <Link
            href="/components/new"
            aria-label="Добавить компонент"
            className="-mr-1 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 font-medium text-[var(--color-accent)] transition hover:bg-[var(--color-surface-2)] active:opacity-70"
          >
            <PlusIcon className="size-5 shrink-0" />
            <span className="hidden sm:inline">Добавить</span>
          </Link>
        }
      />

      <PullToRefresh>
        <div className="mx-auto max-w-5xl px-4 pb-5">
          <Suspense fallback={<div className="flex justify-center py-16"><Spinner /></div>}>
            <ComponentGrid
              key={ownerId}
              ownerId={ownerId}
              initial={initial}
              initialViewMode={initialViewMode}
              initialCollapsedGroups={initialCollapsedGroups}
            />
          </Suspense>
        </div>
      </PullToRefresh>
    </>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseViewMode(value: string | undefined): ViewMode {
  if (value === "grid" || value === "compact" || value === "list") return value;
  return "grid";
}

function parseCollapsedGroupsCookie(value: string | undefined): string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
