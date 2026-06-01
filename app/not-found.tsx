import { ButtonLink } from "@/components/ui/Button";
import { CenterState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <CenterState
      icon="🔍"
      title="Не найдено"
      description="Такого компонента нет или он принадлежит другому пользователю."
      action={<ButtonLink href="/components">К списку</ButtonLink>}
    />
  );
}
