import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { ComponentForm } from "@/components/ComponentForm";
import { getLogistics } from "@/lib/components-repo";

export default async function NewComponentPage() {
  const ownerId = await currentUserId();
  if (!ownerId) redirect("/login");

  const logistics = await getLogistics(ownerId);
  return (
    <ComponentForm
      title="Новый компонент"
      backHref="/components"
      initialLogistics={logistics}
    />
  );
}
