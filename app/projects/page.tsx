import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { readCatalog } from "@/lib/components-repo";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { ProjectList } from "@/components/ProjectList";
import { PlusIcon } from "@/components/ui/Field";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const ownerId = await currentUserId();
  if (!ownerId) redirect("/login");
  const catalog = await readCatalog(ownerId);
  return (
    <>
      <AppHeader
        title="Проекты"
        left={<BackLink href="/components" />}
        right={
          <Link
            href="/projects/new"
            aria-label="Новый проект"
            className="-mr-1 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 font-medium text-[var(--color-accent)] transition hover:bg-[var(--color-surface-2)] active:opacity-70"
          >
            <PlusIcon className="size-5 shrink-0" />
            <span className="hidden sm:inline">Новый проект</span>
          </Link>
        }
      />
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-5">
        <ProjectList
          initial={catalog.projects.map((project) => {
            const components = catalog.items.flatMap((item) => {
              const usages = (item.data.usages ?? []).filter(
                (usage) => usage.projectId === project.id,
              );
              if (!usages.length) return [];
              return [
                {
                  id: item.id,
                  name: item.data.name,
                  quantity: usages.reduce(
                    (sum, usage) => sum + (usage.quantity ?? 0),
                    0,
                  ),
                  unknown: usages.some((usage) => usage.quantity === undefined),
                },
              ];
            });
            const order = new Map(
              (project.componentOrder ?? []).map((id, index) => [id, index]),
            );
            components.sort(
              (a, b) =>
                (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity),
            );
            return { ...project, components };
          })}
        />
      </div>
    </>
  );
}
