import { ProjectNavigationProvider } from "@/components/ProjectNavigationProvider";

export default function ProjectsLayout({
  children,
  modal,
}: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  return (
    <ProjectNavigationProvider>
      <div data-projects-background>{children}</div>
      {modal}
    </ProjectNavigationProvider>
  );
}
