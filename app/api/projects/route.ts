import { handleProjectSave } from "@/lib/project-request";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleProjectSave(request);
}
