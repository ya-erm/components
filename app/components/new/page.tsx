import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { ComponentForm } from "@/components/ComponentForm";

export default async function NewComponentPage() {
  const ownerId = await currentUserId();
  if (!ownerId) redirect("/login");

  return <ComponentForm title="Новый компонент" backHref="/components" />;
}
