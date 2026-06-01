"use client";

import { useRef, useState } from "react";
import { Button, buttonClass } from "@/components/ui/Button";
import { ExportIcon, ImportIcon } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/states";

type Toast = { kind: "ok" | "error"; text: string } | null;

export function ImportExport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  async function handleFile(file: File) {
    setImporting(true);
    setToast(null);
    try {
      const text = await file.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        setToast({ kind: "error", text: "Файл не является корректным JSON" });
        return;
      }

      const res = await fetch("/api/components/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ kind: "error", text: data.error ?? "Не удалось импортировать" });
        return;
      }

      const parts = [`создано ${data.created}`, `обновлено ${data.updated}`];
      if (data.skipped) parts.push(`пропущено ${data.skipped}`);
      setToast({ kind: "ok", text: `Импорт завершён: ${parts.join(", ")}. Обновляю…` });
      // Перезагружаем страницу, чтобы список отразил импортированные данные.
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      setToast({ kind: "error", text: "Ошибка при импорте файла" });
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <a href="/api/components/export" className={buttonClass("secondary", "text-sm")}>
        <ExportIcon className="size-4" />
        Экспорт
      </a>

      <Button
        variant="secondary"
        className="text-sm"
        onClick={() => inputRef.current?.click()}
        disabled={importing}
      >
        {importing ? <Spinner /> : <ImportIcon className="size-4" />}
        {importing ? null : "Импорт"}
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {toast ? (
        <div
          role="status"
          className={`fixed inset-x-4 bottom-5 z-40 mx-auto max-w-md rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${
            toast.kind === "ok"
              ? "border-emerald-600/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "border-red-600/30 bg-red-500/15 text-red-700 dark:text-red-300"
          }`}
        >
          {toast.text}
        </div>
      ) : null}
    </>
  );
}
