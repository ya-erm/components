"use client";

import { useLinkStatus } from "next/link";

export function ProjectsLinkPending() {
  const { pending } = useLinkStatus();
  return (
    <>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-0 top-0 size-3 rounded-full border-2 border-current border-t-transparent ${pending ? "animate-spin opacity-100" : "opacity-0"}`}
      />
      <span role="status" className="sr-only">
        {pending ? "Открываем проекты" : ""}
      </span>
    </>
  );
}
