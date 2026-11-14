import { handleProjectSave } from "@/lib/project-request";
import { currentUserId } from "@/lib/session";
import { readCatalog } from "@/lib/components-repo";
import { getProjectComponentsVersion, orderProjectComponents } from "@/lib/project-components";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const { id } = await params;
  const catalog = await readCatalog(ownerId);
  const project = catalog.projects.find((entry) => entry.id === id);
  if (!project) return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
  return NextResponse.json({
    project,
    components: orderProjectComponents(catalog.items.filter((item) => item.data.usages?.some((usage) => usage.projectId === id)), project.componentOrder),
    version: getProjectComponentsVersion(catalog.items, id),
  }, { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleProjectSave(request, id);
}
