import { handleProjectMutation } from "@/lib/project-mutation-request";
import {
  projectComponentsSchema,
  saveProjectComponents,
} from "@/lib/project-mutations";
export const runtime = "nodejs";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleProjectMutation(
    request,
    projectComponentsSchema,
    (ownerId, input) => saveProjectComponents(ownerId, id, input),
  );
}
