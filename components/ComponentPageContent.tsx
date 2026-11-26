import { notFound, redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { readCatalog } from "@/lib/components-repo";
import { ComponentForm } from "@/components/ComponentForm";

export function componentBackHref(value?: string | string[]) {
  const href = Array.isArray(value) ? value[0] : value;
  return href && /^\/projects(?:\/[^/?#]+)?$/.test(href) && !href.includes("..")
    ? href
    : "/components";
}

export async function ComponentPageContent({ id, modal = false, backHref = "/components" }: { id: string; modal?: boolean; backHref?: string }) {
  const ownerId = await currentUserId();
  if (!ownerId) redirect("/login");

  const { items, orders, shipments, projects } = await readCatalog(ownerId);
  const item = items.find((value) => value.id === id);
  if (!item) notFound();

  return (
    <ComponentForm
      id={item.id}
      initial={item.data}
      initialLogistics={{ orders, shipments, projects }}
      title={item.data.name || "Компонент"}
      backHref={backHref}
      modal={modal}
    />
  );
}
