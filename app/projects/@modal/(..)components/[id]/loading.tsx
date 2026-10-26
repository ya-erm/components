import { ComponentLoading } from "@/app/components/[id]/loading";
import { ComponentModal } from "@/components/ComponentModal";

export default function ProjectComponentLoading() {
  return (
    <ComponentModal backgroundSelector="[data-projects-background]">
      <ComponentLoading modal />
    </ComponentModal>
  );
}
