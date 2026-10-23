"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Полноэкранный шаг импорта: исходный экран остаётся смонтированным. */
export function ImportWorkspace({
  children,
  onClose,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-[var(--color-bg)] p-0 text-[var(--color-fg)] backdrop:bg-black/40"
    >
      {children}
    </dialog>
  );
}
