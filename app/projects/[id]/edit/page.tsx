import { notFound, redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { readCatalog } from "@/lib/components-repo";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { ProjectForm } from "@/components/ProjectForm";

export default async function EditProjectPage({
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
  return (
    <>
      <AppHeader
        title="Редактировать проект"
        left={<BackLink href={`/projects/${encodeURIComponent(id)}`} />}
      />
      <div className="mx-auto max-w-xl px-4 py-5">
        <ProjectForm initial={project} />
      </div>
    </>
  );
}
