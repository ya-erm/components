import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { ProjectDetails } from "@/components/ProjectDetails";

export default async function NewProjectPage() {
  if (!(await currentUserId())) redirect("/login");
  return <ProjectDetails />;
}
