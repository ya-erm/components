import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { AliExpressImport } from "@/components/AliExpressImport";

export const dynamic = "force-dynamic";
export default async function AliExpressImportPage() {
  if (!(await currentUserId())) redirect("/login");
  return (
    <>
      <AppHeader
        title="Импорт из AliExpress"
        left={<BackLink href="/components" />}
      />
      <main className="mx-auto max-w-4xl px-4 py-5">
        <AliExpressImport />
      </main>
    </>
  );
}
