import { ComponentPageContent } from "@/app/components/[id]/page";
import { ComponentModal } from "@/components/ComponentModal";

export default async function InterceptedComponentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ComponentModal>
      <ComponentPageContent id={id} modal />
    </ComponentModal>
  );
}
