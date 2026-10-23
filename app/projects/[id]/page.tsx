import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { readCatalog } from "@/lib/components-repo";
import { ProjectDetails } from "@/components/ProjectDetails";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ownerId = await currentUserId();
  if (!ownerId) redirect("/login");
  const { id } = await params;
  const catalog = await readCatalog(ownerId);
  const project = catalog.projects.find((project) => project.id === id);
  if (!project) notFound();
  const components = catalog.items.flatMap((item) => {
    const usages = (item.data.usages ?? []).filter(
      (usage) => usage.projectId === id,
    );
    if (!usages.length) return [];
    return [
      {
        id: item.id,
        name: item.data.name,
        quantity: usages.reduce((sum, usage) => sum + (usage.quantity ?? 0), 0),
        unknown: usages.some((usage) => usage.quantity === undefined),
      },
    ];
  });
  return (
    <ProjectDetails key={project.id} initial={project}>
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-lg font-semibold">Компоненты проекта</h2>
        <ul className="flex flex-col gap-3">
          {components.map((component) => (
            <li key={component.id}>
              <Link
                href={`/components/${component.id}`}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <span className="min-w-0 break-words text-[var(--color-accent)]">
                  {component.name}
                </span>
                <span className="shrink-0 tabular-nums">
                  {component.unknown
                    ? component.quantity
                      ? `${component.quantity}+`
                      : "—"
                    : component.quantity}{" "}
                  шт.
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {!components.length ? (
          <p className="text-sm text-[var(--color-muted)]">
            Компоненты пока не использованы. Выберите этот проект в разделе
            «Использование» компонента.
          </p>
        ) : null}
      </section>
    </ProjectDetails>
  );
}
