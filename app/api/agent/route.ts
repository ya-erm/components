import { NextResponse } from "next/server";
import { agentApi } from "@/lib/agent-api";

/** Публична только документация; пользовательских данных здесь нет. */
export function GET() {
  return NextResponse.json(agentApi);
}
