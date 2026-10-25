import { notFound, redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { readCatalog } from "@/lib/components-repo";
import { ProjectDetails } from "@/components/ProjectDetails";
import { ProjectComponents } from "@/components/ProjectComponents";

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
  return (
    <ProjectDetails key={project.id} initial={project}>
      <ProjectComponents
        initialProject={project}
        initialItems={catalog.items}
      />
    </ProjectDetails>
  );
}
