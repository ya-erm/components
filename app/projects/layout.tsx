import { ProjectNavigationProvider } from "@/components/ProjectNavigationProvider";

export default function ProjectsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ProjectNavigationProvider>
      <div data-projects-background>{children}</div>
    </ProjectNavigationProvider>
  );
}
