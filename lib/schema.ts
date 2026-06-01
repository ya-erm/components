import { z } from "zod";

/**
 * Единственный источник правды о наборе полей компонента.
 * Меняется здесь (в коде), а не через интерфейс приложения.
 */

export const COMPONENT_STATUSES = [
  "in_stock",
  "in_transit",
  "out_of_stock",
] as const;

export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];

export const STATUS_LABELS: Record<ComponentStatus, string> = {
  in_stock: "В наличии",
  in_transit: "В пути",
  out_of_stock: "Нет в наличии",
};

export const MAX_IMAGES = 10;
export const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5 МБ — лимит тела serverless-функции Vercel

export const MAX_TAGS = 30;

/** Подсказки для поля «тип» (свой ввод тоже разрешён). */
export const COMPONENT_TYPES = [
  "Резистор",
  "Конденсатор",
  "Диод",
  "Светодиод",
  "Транзистор",
  "Микросхема",
  "Стабилизатор",
  "Датчик",
  "Дисплей",
  "Модуль",
  "Плата/МК",
  "Разъём",
  "Кабель/Провод",
  "Реле",
  "Двигатель",
  "Кнопка",
  "Крепёж",
  "Инструмент",
  "Расходники",
  "Прочее",
] as const;

/**
 * Схема значений поля `data` компонента. Валидируется и на клиенте, и на сервере
 * перед записью в БД. Пустые опциональные строки приводим к undefined,
 * чтобы не хранить мусор в JSON.
 */
const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

export const componentDataSchema = z.object({
  name: z
    .string({ required_error: "Укажите название" })
    .trim()
    .min(1, "Укажите название")
    .max(200, "Слишком длинное название"),

  images: z
    .array(z.string().url("Некорректная ссылка на изображение"))
    .max(MAX_IMAGES, `Не более ${MAX_IMAGES} изображений`)
    .default([]),

  quantity: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ invalid_type_error: "Количество должно быть числом" })
      .int("Количество должно быть целым")
      .min(0, "Количество не может быть отрицательным")
      .optional(),
  ),

  status: z.preprocess(
    emptyToUndefined,
    z.enum(COMPONENT_STATUSES).optional(),
  ),

  type: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(60, "Слишком длинный тип").optional(),
  ),

  tags: z
    .array(z.string().trim().min(1).max(30, "Слишком длинный тег"))
    .max(MAX_TAGS, `Не более ${MAX_TAGS} тегов`)
    // убираем пустые и дубликаты (без учёта регистра)
    .transform((arr) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const t of arr) {
        const key = t.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(t);
        }
      }
      return out;
    })
    .default([]),

  note: z.preprocess(
    emptyToUndefined,
    z.string().max(2000, "Слишком длинная заметка").optional(),
  ),

  url: z.preprocess(
    emptyToUndefined,
    z.string().url("Некорректная ссылка").optional(),
  ),
});

export type ComponentData = z.infer<typeof componentDataSchema>;

/** Главное изображение компонента — первое в списке. */
export function mainImage(data: Pick<ComponentData, "images">): string | undefined {
  return data.images?.[0];
}
