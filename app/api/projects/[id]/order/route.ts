import { handleProjectMutation } from "@/lib/project-mutation-request";
import {
  projectOrderSchema,
  reorderProjectComponents,
} from "@/lib/project-mutations";
export const runtime = "nodejs";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleProjectMutation(request, projectOrderSchema, (ownerId, input) =>
    reorderProjectComponents(ownerId, id, input.ids),
  );
}
