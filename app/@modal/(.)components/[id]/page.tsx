import { ComponentPageContent, componentBackHref } from "@/components/ComponentPageContent";
import { ComponentModal } from "@/components/ComponentModal";

export default async function InterceptedComponentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <ComponentModal>
      <ComponentPageContent id={id} backHref={componentBackHref(query.returnTo)} modal />
    </ComponentModal>
  );
}
