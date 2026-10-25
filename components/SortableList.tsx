"use client";

import { useId, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** Only the handle captures touch gestures, so the rest of the list still scrolls. */
export function SortableList<T extends { id: string }>({
  items,
  disabled = false,
  compact = false,
  label,
  getLabel,
  onReorder,
  children,
}: {
  items: T[];
  disabled?: boolean;
  compact?: boolean;
  label: string;
  getLabel: (item: T) => string;
  onReorder: (items: T[]) => void;
  children: (item: T, handle: ReactNode) => ReactNode;
}) {
  const id = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const name = (itemId: string | number) => {
    const item = items.find((item) => item.id === itemId);
    return item ? getLabel(item) : "Элемент";
  };
  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Нажмите пробел, чтобы взять элемент. Стрелки перемещают его, пробел сохраняет положение, Escape отменяет.",
        },
        announcements: {
          onDragStart: ({ active }) => `Перемещение: ${name(active.id)}.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${name(active.id)}: позиция ${items.findIndex((item) => item.id === over.id) + 1} из ${items.length}.`
              : undefined,
          onDragEnd: ({ active, over }) =>
            over
              ? `${name(active.id)} перемещён на позицию ${items.findIndex((item) => item.id === over.id) + 1}.`
              : "Перемещение отменено.",
          onDragCancel: () => "Перемещение отменено.",
        },
      }}
      onDragEnd={({ active, over }) => {
        if (disabled || !over || active.id === over.id) return;
        const from = items.findIndex((item) => item.id === active.id);
        const to = items.findIndex((item) => item.id === over.id);
        if (from !== -1 && to !== -1) onReorder(arrayMove(items, from, to));
      }}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          aria-label={label}
          className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`}
        >
          {items.map((item) => (
            <SortableRow
              key={item.id}
              id={item.id}
              label={getLabel(item)}
              disabled={disabled || items.length < 2}
            >
              {(handle) => children(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  label,
  disabled,
  children,
}: {
  id: string;
  label: string;
  disabled: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 1 : undefined,
      }}
      className={isDragging ? "opacity-70" : ""}
    >
      {children(
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={disabled}
          aria-label={`Переместить ${label}`}
          aria-roledescription="Перетаскиваемый элемент"
          title="Перетащите или используйте пробел и стрелки"
          className="flex size-11 shrink-0 touch-none items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-30 cursor-grab active:cursor-grabbing"
        >
          <svg
            viewBox="0 0 20 20"
            className="size-5"
            fill="currentColor"
            aria-hidden="true"
          >
            {[5, 10, 15].map((y) => (
              <g key={y}>
                <circle cx="7" cy={y} r="1.5" />
                <circle cx="13" cy={y} r="1.5" />
              </g>
            ))}
          </svg>
        </button>,
      )}
    </li>
  );
}
