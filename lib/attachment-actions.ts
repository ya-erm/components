import type { ComponentDTO } from "./components-repo";
import type { Attachment } from "./schema";

/** Rebase one file action on the latest server array, never save other form fields. */
export async function changeAttachment(componentId: string, file: Attachment, action: "remove" | "restore", index = 0, request: typeof fetch = fetch) {
  const url = `/api/components/${encodeURIComponent(componentId)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await request(url, { cache: "no-store" });
    if (!current.ok) throw new Error("Не удалось прочитать компонент. Повторите попытку.");
    const item: ComponentDTO = await current.json();
    const files = item.data.attachments ?? [];
    const previousIndex = files.findIndex((entry) => entry.id === file.id);
    if ((action === "remove" && previousIndex < 0) || (action === "restore" && previousIndex >= 0))
      return { item, changed: false, index };
    const next = [...files];
    if (action === "remove") next.splice(previousIndex, 1);
    else next.splice(Math.min(Math.max(0, index), next.length), 0, file);
    const version = current.headers.get("ETag");
    if (!version) throw new Error("Не удалось проверить версию компонента. Повторите попытку.");
    const saved = await request(url, {
      method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": version },
      body: JSON.stringify({ data: { attachments: next } }),
    });
    if (saved.status === 409) continue;
    if (!saved.ok) {
      const error = await saved.json().catch(() => ({}));
      throw new Error(error.error ?? "Не удалось изменить файлы. Повторите попытку.");
    }
    return { item: await saved.json() as ComponentDTO, changed: true, index: action === "remove" ? previousIndex : index };
  }
  throw new Error("Файлы изменились в другом окне. Повторите попытку.");
}

/** Keep unsaved uploads while incorporating concurrent server additions/removals. */
export function mergeAttachmentDraft(local: Attachment[], baseline: Attachment[], saved: Attachment[], removedId?: string) {
  const known = new Set([...baseline, ...saved].map((file) => file.id));
  return [...saved, ...local.filter((file) => file.id !== removedId && !known.has(file.id))];
}

/** Reorder only existing references; keep concurrent additions and never resurrect removals. */
export async function reorderAttachments(componentId: string, ids: string[], request: typeof fetch = fetch) {
  const url = `/api/components/${encodeURIComponent(componentId)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await request(url, { cache: "no-store" });
    if (!current.ok) throw new Error("Не удалось прочитать компонент. Повторите попытку.");
    const item: ComponentDTO = await current.json();
    const files = item.data.attachments ?? [];
    const byId = new Map(files.map((file) => [file.id, file]));
    const requested = new Set(ids);
    const next = [...ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []), ...files.filter((file) => !requested.has(file.id))];
    if (next.every((file, index) => file.id === files[index]?.id)) return item;
    const version = current.headers.get("ETag");
    if (!version) throw new Error("Не удалось проверить версию компонента. Повторите попытку.");
    const saved = await request(url, {
      method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": version },
      body: JSON.stringify({ data: { attachments: next } }),
    });
    if (saved.status === 409) continue;
    if (!saved.ok) {
      const error = await saved.json().catch(() => ({}));
      throw new Error(error.error ?? "Не удалось сохранить порядок файлов.");
    }
    return await saved.json() as ComponentDTO;
  }
  throw new Error("Файлы изменились в другом окне. Повторите попытку.");
}

export function mergeReorderedAttachments(local: Attachment[], baseline: Attachment[], saved: Attachment[]) {
  const known = new Set(baseline.map((file) => file.id));
  const byId = new Map(saved.map((file) => [file.id, file]));
  for (const file of local) if (!known.has(file.id) && !byId.has(file.id)) byId.set(file.id, file);
  const localIds = new Set(local.map((file) => file.id));
  return [...local.flatMap((file) => byId.has(file.id) ? [byId.get(file.id)!] : []), ...saved.filter((file) => !localIds.has(file.id))];
}
