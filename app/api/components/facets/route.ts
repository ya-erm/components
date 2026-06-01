import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { getFacets } from "@/lib/components-repo";

export const runtime = "nodejs";

export async function GET() {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const facets = await getFacets(ownerId);
  return NextResponse.json(facets);
}
