import { handleProjectSave } from "@/lib/project-request";
import { currentUserId } from "@/lib/session";
import { readCatalog } from "@/lib/components-repo";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export async function GET() {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  return NextResponse.json((await readCatalog(ownerId)).projects, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  return handleProjectSave(request);
}
