import { notFound } from "next/navigation";
import { z } from "zod";
import { AttachmentDownload } from "@/components/AttachmentDownload";
import { HtmlAttachmentPreview } from "@/components/HtmlAttachmentPreview";
import { attachmentSchema } from "@/lib/schema";

export const metadata = { title: "Предпросмотр HTML · Мои компоненты" };

export default async function FilePreviewPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string | string[] }>;
}) {
  const [{ id }, { name }] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const parsed = attachmentSchema.shape.name.safeParse(name);
  const file = { id, name: parsed.success ? parsed.data : "page.html" };

  return <main className="flex h-dvh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
    <header className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold" title={file.name}>{file.name}</h1>
        <p className="text-xs text-[var(--color-muted)]">Предпросмотр HTML</p>
      </div>
      <AttachmentDownload file={file} />
    </header>
    <HtmlAttachmentPreview key={file.id} file={file} />
  </main>;
}
