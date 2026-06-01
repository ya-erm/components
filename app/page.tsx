import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";

export default async function Home() {
  const userId = await currentUserId();
  redirect(userId ? "/components" : "/login");
}
