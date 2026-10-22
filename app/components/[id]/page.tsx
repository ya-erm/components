import { notFound, redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { readCatalog } from "@/lib/components-repo";
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
  const { items, orders, shipments, projects } = await readCatalog(ownerId);
  const item = items.find((value) => value.id === id);
  if (!item) notFound();

  return (
    <ComponentForm
      id={item.id}
      initial={item.data}
      initialLogistics={{ orders, shipments, projects }}
      title={item.data.name || "Компонент"}
      backHref="/components"
    />
  );
}
