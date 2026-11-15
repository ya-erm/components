"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Копировать" }: { text: string; label?: string }) {
  const [message, setMessage] = useState("");
  return (
    <span>
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(text); setMessage("Скопировано"); }
        catch { setMessage("Выделите и скопируйте текст вручную"); }
      }}>{label}</button>
      <span role="status" aria-live="polite" className="ml-2 text-xs">{message}</span>
    </span>
  );
}
