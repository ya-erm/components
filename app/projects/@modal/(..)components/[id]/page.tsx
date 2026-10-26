import { ComponentPageContent, componentBackHref } from "@/app/components/[id]/page";
import { ComponentModal } from "@/components/ComponentModal";

export default async function ProjectComponentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <ComponentModal backgroundSelector="[data-projects-background]">
      <ComponentPageContent id={id} backHref={componentBackHref(query.returnTo)} modal />
    </ComponentModal>
  );
}
