import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { ImportExport } from "@/components/ImportExport";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {title}
      </h2>
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        {children}
      </div>
    </section>
  );
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <>
      <AppHeader title="Настройки" left={<BackLink href="/components" />} />

      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-5">
        <Section title="Аккаунт">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-[var(--color-muted)]">Логин</p>
              <p className="truncate font-medium">{session.user.name}</p>
            </div>
            <SignOutButton />
          </div>
        </Section>

        <Section title="Данные">
          <p className="mb-3 text-sm text-[var(--color-muted)]">
            Скачайте весь каталог в JSON или загрузите компоненты из файла
          </p>
          <div className="flex flex-wrap gap-2">
            <ImportExport />
          </div>
        </Section>
      </div>
    </>
  );
}
