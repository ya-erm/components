import { ComponentLoading } from "@/app/components/[id]/loading";
import { ComponentModal } from "@/components/ComponentModal";

export default function InterceptedComponentLoading() {
  return (
    <ComponentModal>
      <ComponentLoading modal />
    </ComponentModal>
  );
}
