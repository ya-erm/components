import { apiDocumentationMarkdown } from "@/lib/api-documentation";

export function GET() {
  return new Response(apiDocumentationMarkdown(), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
