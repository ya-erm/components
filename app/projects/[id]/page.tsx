import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { readCatalog } from "@/lib/components-repo";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { ProjectDescription } from "@/components/ProjectDescription";
import { ProjectGallery } from "@/components/ProjectGallery";
import { ButtonLink } from "@/components/ui/Button";

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
    <>
      <AppHeader title={project.name} left={<BackLink href="/projects" />} />
      <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 break-words text-2xl font-semibold">
            {project.name}
          </h1>
          <ButtonLink
            href={`/projects/${encodeURIComponent(id)}/edit`}
            variant="secondary"
          >
            Изменить
          </ButtonLink>
        </div>
        {project.images?.length ? (
          <ProjectGallery images={project.images} />
        ) : null}
        {project.description ? (
          <ProjectDescription text={project.description} />
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            Описание пока не добавлено.
          </p>
        )}
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
      </div>
    </>
  );
}
