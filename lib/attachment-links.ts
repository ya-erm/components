import type { Attachment } from "./schema";

export function isPdfAttachment({ name, contentType }: Pick<Attachment, "name" | "contentType">) {
  return /\.pdf$/i.test(name) || contentType.split(";", 1)[0].trim().toLowerCase() === "application/pdf";
}

export function attachmentUrl(file: Pick<Attachment, "id" | "name">, preview?: "pdf") {
  const params = new URLSearchParams({ name: file.name });
  if (preview) params.set("preview", preview);
  return `/api/files/${file.id}?${params}`;
}
