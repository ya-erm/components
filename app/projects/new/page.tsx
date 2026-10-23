import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { AppHeader, BackLink } from "@/components/AppHeader";
import { ProjectForm } from "@/components/ProjectForm";

export default async function NewProjectPage() {
  if (!(await currentUserId())) redirect("/login");
  return (
    <>
      <AppHeader title="Новый проект" left={<BackLink href="/projects" />} />
      <div className="mx-auto max-w-xl px-4 py-5">
        <ProjectForm />
      </div>
    </>
  );
}
