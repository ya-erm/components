import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { readCatalog } from "@/lib/components-repo";
import { orderProjectComponents } from "@/lib/project-components";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { ProjectList, type ProjectListEntry } from "@/components/ProjectList";
import { PlusIcon } from "@/components/ui/Field";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const ownerId = await currentUserId();
  if (!ownerId) redirect("/login");
  const catalog = await readCatalog(ownerId);
  const componentsByProject = new Map<
    string,
    Map<string, ProjectListEntry["components"][number]>
  >();
  for (const item of catalog.items) {
    for (const usage of item.data.usages ?? []) {
      let components = componentsByProject.get(usage.projectId);
      if (!components) {
        components = new Map();
        componentsByProject.set(usage.projectId, components);
      }
      const component = components.get(item.id);
      if (component) {
        component.quantity += usage.quantity ?? 0;
        component.unknown ||= usage.quantity === undefined;
      } else {
        components.set(item.id, {
          id: item.id,
          name: item.data.name,
          image: item.data.images?.[0],
          quantity: usage.quantity ?? 0,
          unknown: usage.quantity === undefined,
        });
      }
    }
  }
  const projects: ProjectListEntry[] = catalog.projects.map((project) => ({
    ...project,
    components: orderProjectComponents(
      [...(componentsByProject.get(project.id)?.values() ?? [])],
      project.componentOrder,
    ),
  }));
  return (
    <>
      <AppHeader
        title="Проекты"
        left={<BackLink href="/components" prefetch />}
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
        <ProjectList initial={projects} />
      </div>
    </>
  );
}
