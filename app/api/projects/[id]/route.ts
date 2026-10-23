import { handleProjectSave } from "@/lib/project-request";

export const runtime = "nodejs";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleProjectSave(request, id);
}
