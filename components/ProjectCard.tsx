import Image from "next/image";
import Markdown from "react-markdown";
import type { Project } from "@/lib/schema";

/** Не содержит ссылок: карточку можно использовать внутри кнопки выбора. */
export function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      {project.images?.[0] ? (
        <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-[var(--color-surface-2)]">
          <Image
            src={project.images[0]}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-2xl text-[var(--color-muted)]"
        >
          {project.name.slice(0, 1).toUpperCase() || "+"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="break-words font-semibold">
          {project.name || "Новый проект"}
        </h3>
        {project.description ? (
          <div className="mt-1 line-clamp-3 break-words text-sm text-[var(--color-muted)]">
            <Markdown
              allowedElements={["p", "strong", "em", "code", "del"]}
              unwrapDisallowed
              skipHtml
            >
              {project.description}
            </Markdown>
          </div>
        ) : (
          <p className="mt-1 text-sm text-[var(--color-muted)]">Без описания</p>
        )}
        {(project.images?.length ?? 0) > 1 ? (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Фото: {project.images!.length}
          </p>
        ) : null}
      </div>
    </div>
  );
}
