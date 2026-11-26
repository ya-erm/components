import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { getLogistics } from "@/lib/components-repo";
import { ComponentForm } from "@/components/ComponentForm";
import { ComponentModal } from "@/components/ComponentModal";

export default async function InterceptedNewComponentPage() {
  const ownerId = await currentUserId();
  if (!ownerId) redirect("/login");

  const logistics = await getLogistics(ownerId);
  return (
    <ComponentModal>
      <ComponentForm
        title="Новый компонент"
        backHref="/components"
        initialLogistics={logistics}
        modal
      />
    </ComponentModal>
  );
}
