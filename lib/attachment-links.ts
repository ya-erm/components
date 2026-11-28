import type { Attachment } from "./schema";

function mimeType(value: string) {
  return value.split(";", 1)[0].trim().toLowerCase();
}

export function isPdfAttachment({ name, contentType }: Pick<Attachment, "name" | "contentType">) {
  return /\.pdf$/i.test(name) || mimeType(contentType) === "application/pdf";
}

export function isHtmlAttachment({ name, contentType }: Pick<Attachment, "name" | "contentType">) {
  return /\.html?$/i.test(name) || mimeType(contentType) === "text/html";
}

export function attachmentUrl(file: Pick<Attachment, "id" | "name">, preview?: "pdf" | "html") {
  const params = new URLSearchParams({ name: file.name });
  if (preview === "html") return `/files/${file.id}/preview?${params}`;
  if (preview === "pdf") params.set("preview", preview);
  return `/api/files/${file.id}?${params}`;
}
