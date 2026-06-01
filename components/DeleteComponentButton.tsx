"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/states";

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
      router.push("/components");
      router.refresh();
    } catch {
      setError("Не удалось удалить");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="danger-outline" onClick={onDelete} disabled={deleting}>
        {deleting ? <Spinner /> : "Удалить"}
      </Button>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
