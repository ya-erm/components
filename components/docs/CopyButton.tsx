"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Копировать" }: { text: string; label?: string }) {
  const [message, setMessage] = useState("");
  return (
    <span className="inline-flex shrink-0">
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(text); setMessage("Скопировано"); }
        catch { setMessage("Выделите и скопируйте текст вручную"); }
      }} aria-label={label} title={message || undefined}>{message === "Скопировано" ? "✓ Скопировано" : label}</button>
      <span role="status" aria-live="polite" className="sr-only">{message}</span>
    </span>
  );
}
