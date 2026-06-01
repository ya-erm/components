import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { listComponents } from "@/lib/components-repo";

export const runtime = "nodejs";

const EXPORT_VERSION = 1;

export async function GET() {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { items } = await listComponents({ ownerId, all: true });

  const payload = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    count: items.length,
    components: items.map((i) => ({ id: i.id, data: i.data })),
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="components-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
