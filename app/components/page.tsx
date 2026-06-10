import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { listComponents } from "@/lib/components-repo";
import { ComponentGrid } from "@/components/ComponentGrid";
import { AppHeader } from "@/components/AppHeader";
import { PullToRefresh } from "@/components/PullToRefresh";
import { GearIcon, PlusIcon } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/states";

export const dynamic = "force-dynamic";

export default async function ComponentsPage() {
  const ownerId = await currentUserId();
  if (!ownerId) redirect("/login");

  const initial = await listComponents({ ownerId, all: true });

  return (
    <>
      <AppHeader
        title="Компоненты"
        left={
          <Link
            href="/settings"
            aria-label="Настройки"
            className="-ml-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] active:opacity-70"
          >
            <GearIcon className="size-5 shrink-0" />
            <span className="hidden sm:inline">Настройки</span>
          </Link>
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
        <div className="mx-auto max-w-5xl px-4 py-5">
          <Suspense fallback={<div className="flex justify-center py-16"><Spinner /></div>}>
            <ComponentGrid initial={initial} />
          </Suspense>
        </div>
      </PullToRefresh>
    </>
  );
}
