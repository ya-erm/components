import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { readCatalog } from "@/lib/components-repo";
import { AppHeader, BackLink } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const ownerId = await currentUserId();
  if (!ownerId) redirect("/login");
  const catalog = await readCatalog(ownerId);
  return (
    <>
      <AppHeader title="Проекты" left={<BackLink href="/components" />} />
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-5">
        <p className="text-sm text-[var(--color-muted)]">
          Создайте или выберите проект в разделе «Использование» компонента.
        </p>
        {catalog.projects.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            Проектов пока нет.
          </p>
        ) : null}
        {catalog.projects.map((project) => {
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
          return (
            <section
              key={project.id}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <h2 className="mb-3 text-lg font-semibold">{project.name}</h2>
              <ul className="flex flex-col gap-2">
                {components.map((component) => (
                  <li key={component.id}>
                    <Link
                      href={`/components/${component.id}`}
                      className="flex items-start justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 text-[var(--color-accent)]">
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
                  Компоненты пока не использованы.
                </p>
              ) : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
