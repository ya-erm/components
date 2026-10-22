"use client";

import { type Comment } from "@/lib/schema";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";

export function CommentsEditor({
  value,
  onChange,
  label,
}: {
  value: Comment[];
  onChange: (value: Comment[]) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {value.map((comment, index) => (
        <div
          key={comment.id}
          className="rounded-xl border border-[var(--color-border)] p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
            <time dateTime={comment.createdAt}>
              {comment.createdAt.slice(0, 10)}
            </time>
            <button
              type="button"
              onClick={() =>
                onChange(value.filter((item) => item.id !== comment.id))
              }
              aria-label={`Удалить комментарий ${index + 1}: ${label}`}
              className="p-1 text-red-500"
            >
              Удалить
            </button>
          </div>
          <Textarea
            aria-label={`Комментарий ${index + 1}: ${label}`}
            value={comment.text}
            maxLength={2000}
            required
            onChange={(event) =>
              onChange(
                value.map((item) =>
                  item.id === comment.id
                    ? { ...item, text: event.target.value }
                    : item,
                ),
              )
            }
          />
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={value.length >= 500}
        onClick={() => {
          onChange([
            ...value,
            {
              id: crypto.randomUUID(),
              text: "",
              createdAt: new Date().toISOString(),
            },
          ]);
        }}
      >
        Добавить комментарий
      </Button>
      <p className="text-xs text-[var(--color-muted)]">
        Комментарии сохраняются вместе с формой по кнопке «Готово».
      </p>
    </div>
  );
}
