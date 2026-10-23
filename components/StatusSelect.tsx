"use client";

import { useEffect, useId, useRef, useState } from "react";
import { clsx } from "clsx";
import type { ComponentStatus, Purchase } from "@/lib/schema";
import { StatusIcon } from "@/components/StatusIcon";
import { ChevronDownIcon, controlClass } from "@/components/ui/Field";

type Option<T extends string> = {
  value: T;
  label: string;
  status?: ComponentStatus | Purchase["status"];
};

export function StatusSelect<T extends string>({
  id,
  value,
  onChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  className?: string;
  "aria-label"?: string;
}) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
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
      className="relative min-w-0 w-full"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        id={controlId}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${controlId}-options` : undefined}
        className={clsx(
          controlClass,
          "flex items-center gap-2 text-left",
          className,
        )}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {selected?.status ? (
          <StatusIcon status={selected.status} className="size-4" />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-[var(--color-muted)]" />
      </button>
      {open ? (
        <div
          ref={list}
          id={`${controlId}-options`}
          role="listbox"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabel ? undefined : controlId}
          className="absolute left-0 top-full z-30 mt-1 max-h-72 min-w-full w-max max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              setOpen(false);
              button.current?.focus();
              return;
            }
            const entries = Array.from(
              list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
            );
            const index = entries.indexOf(document.activeElement as HTMLElement);
            let next: number | undefined;
            if (event.key === "ArrowDown") next = (index + 1) % entries.length;
            if (event.key === "ArrowUp")
              next = (index - 1 + entries.length) % entries.length;
            if (event.key === "Home") next = 0;
            if (event.key === "End") next = entries.length - 1;
            if (event.key.length === 1 && event.key !== " ") {
              const match = options.findIndex((_, offset) => {
                const candidate = options[(index + 1 + offset) % options.length];
                return candidate.label
                  .toLocaleLowerCase()
                  .startsWith(event.key.toLocaleLowerCase());
              });
              if (match >= 0) next = (index + 1 + match) % options.length;
            }
            if (next !== undefined) {
              event.preventDefault();
              entries[next]?.focus();
            }
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === selected?.value}
              tabIndex={option.value === selected?.value ? 0 : -1}
              className={clsx(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-[var(--color-surface-2)] focus:bg-[var(--color-surface-2)]",
                option.value === value && "font-medium text-[var(--color-accent)]",
              )}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                button.current?.focus();
              }}
            >
              {option.status ? (
                <StatusIcon status={option.status} className="size-4" />
              ) : (
                <span className="size-4 shrink-0" />
              )}
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
