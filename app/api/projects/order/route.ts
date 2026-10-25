import { handleProjectMutation } from "@/lib/project-mutation-request";
import { projectOrderSchema, reorderProjects } from "@/lib/project-mutations";
export const runtime = "nodejs";
export async function PATCH(request: Request) {
  return handleProjectMutation(request, projectOrderSchema, (ownerId, input) =>
    reorderProjects(ownerId, input.ids),
  );
}
