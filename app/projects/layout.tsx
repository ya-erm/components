import { ProjectNavigationProvider } from "@/components/ProjectNavigationProvider";

export default function ProjectsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ProjectNavigationProvider>{children}</ProjectNavigationProvider>;
}
