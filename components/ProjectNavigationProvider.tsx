"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ProjectListEntry } from "@/components/ProjectList";

const ProjectPreviewContext = createContext<{
  preview: ProjectListEntry | null;
  setPreview: (project: ProjectListEntry) => void;
} | null>(null);

export function ProjectNavigationProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<ProjectListEntry | null>(null);
  return (
    <ProjectPreviewContext.Provider value={{ preview, setPreview }}>
      {children}
    </ProjectPreviewContext.Provider>
  );
}

export function useProjectNavigation() {
  const context = useContext(ProjectPreviewContext);
  if (!context) throw new Error("ProjectNavigationProvider is missing");
  return context;
}
