"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, controlClass } from "@/components/ui/Field";
import {
  ALI_KIND_LABELS,
  type AliKindFilter as Kind,
} from "@/lib/aliexpress-filter";

export function AliKindFilter({
  id,
  value,
  onChange,
  hiddenCount,
}: {
  id: string;
  value: Kind[];
  onChange: (value: Kind[]) => void;
  hiddenCount: number;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const options: { value: Kind; label: string }[] = [
    { value: "hidden", label: `Скрытые (${hiddenCount})` },
    ...Object.entries(ALI_KIND_LABELS).map(([value, label]) => ({
      value: value as Kind,
      label,
    })),
  ];
  const summary = value.length
    ? options
        .filter((option) => value.includes(option.value))
        .map((option) => option.label)
        .join(", ")
    : "Все позиции";

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <div
      ref={container}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }}
    >
      <button
        ref={button}
        id={id}
        type="button"
        aria-label={`Показать: ${summary}`}
        aria-expanded={open}
        aria-controls={`${id}-options`}
        className={`${controlClass} flex min-w-0 items-center justify-between gap-2 text-left`}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="min-w-0 truncate" title={summary}>
          {summary}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-[var(--color-muted)]" />
      </button>
      {open ? (
        <div
          id={`${id}-options`}
          role="group"
          aria-label="Категории товаров"
          className="absolute inset-x-0 top-full z-20 mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg"
        >
          <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-[var(--color-surface-2)]">
            <input
              type="checkbox"
              className="size-4 shrink-0"
              checked={!value.length}
              onChange={() => onChange([])}
            />
            Все позиции
          </label>
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-[var(--color-surface-2)]"
            >
              <input
                type="checkbox"
                className="size-4 shrink-0"
                checked={value.includes(option.value)}
                onChange={(event) => onChange(
                  event.target.checked
                    ? [...value, option.value]
                    : value.filter((item) => item !== option.value),
                )}
              />
              {option.label}
            </label>
          ))}
          <p className="px-2 pt-2 pb-1 text-xs text-[var(--color-muted)]">
            Скрытые показываются только при выборе этого пункта.
          </p>
        </div>
      ) : null}
    </div>
  );
}
