import { notFound, redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { getComponent } from "@/lib/components-repo";
import { ComponentForm } from "@/components/ComponentForm";

export const dynamic = "force-dynamic";

export default async function ComponentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ownerId = await currentUserId();
  if (!ownerId) redirect("/login");

  const { id } = await params;
  const item = await getComponent(ownerId, id);
  if (!item) notFound();

  return (
    <ComponentForm
      id={item.id}
      initial={item.data}
      title={item.data.name || "Компонент"}
      backHref="/components"
    />
  );
}
