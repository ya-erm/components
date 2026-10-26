import { ComponentPageContent, componentBackHref } from "@/components/ComponentPageContent";

export const dynamic = "force-dynamic";

export default async function ComponentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <ComponentPageContent id={id} backHref={componentBackHref(query.returnTo)} />;
}
