"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/states";
import { componentReturnTarget, removeSavedComponent } from "@/lib/component-list-state";

export function DeleteComponentButton({ id }: { id: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!confirm("Удалить компонент? Это действие нельзя отменить.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/components/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const returnTarget = componentReturnTarget(`/components/${id}`, "/components");
      removeSavedComponent(id);
      router.push(returnTarget.href, { scroll: returnTarget.scroll });
      router.refresh();
    } catch {
      setError("Не удалось удалить");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="danger-outline" onClick={onDelete} disabled={deleting} className="w-full">
        {deleting ? <Spinner /> : "Удалить"}
      </Button>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
