import { z } from "zod";

/**
 * Единственный источник правды о наборе полей компонента.
 * Меняется здесь (в коде), а не через интерфейс приложения.
 */

export const COMPONENT_STATUSES = [
  "in_stock",
  "in_transit",
  "planned",
  "used",
  "unassigned",
  "out_of_stock",
] as const;

export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];

export const STATUS_LABELS: Record<ComponentStatus, string> = {
  in_stock: "В наличии",
  in_transit: "В пути",
  planned: "Запланировано",
  used: "Использовано",
  unassigned: "Не распределено",
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
 * перед записью в хранилище. Пустые опциональные строки приводим к undefined,
 * чтобы не хранить мусор в JSON.
 */
const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
const optionalUrl = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .url("Некорректная ссылка")
    .refine(
      (value) => /^https?:\/\//i.test(value),
      "Укажите ссылку http или https",
    )
    .optional(),
);
const identifier = z.string().trim().min(1).max(200);
const count = z.number().int().nonnegative().safe();

export const commentSchema = z.object({
  id: identifier,
  text: z.string().trim().min(1, "Напишите комментарий").max(2000),
  createdAt: z.string().datetime(),
});
export const orderSchema = z.object({
  id: identifier,
  number: z
    .string()
    .trim()
    .min(1, "Укажите название или номер заказа")
    .max(200),
  source: z.string().trim().min(1).max(100).default("Вручную"),
  store: optionalText(200),
  url: optionalUrl,
  aliexpress: z
    .object({
      orderId: identifier,
      exportedAt: z.string().datetime(),
      date: z.string().optional(),
      status: z.string().optional(),
      total: z.string().optional(),
      shipments: z
        .array(
          z.object({
            trackingNumber: z.string(),
            carrier: z.string().optional(),
            status: z.string().optional(),
            lastEvent: z.string().optional(),
            lastEventTime: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  comments: z.array(commentSchema).max(500).default([]),
  trackingNumbers: z
    .array(z.string().trim().min(1, "Укажите трек-номер").max(200))
    .max(100)
    .default([])
    .transform((values) => [
      ...new Map(values.map((value) => [value.toLowerCase(), value])).values(),
    ]),
});
export const projectSchema = z.object({
  id: identifier,
  name: z.string().trim().min(1, "Укажите название проекта").max(200),
  description: optionalText(20000),
  images: z
    .array(
      z
        .string()
        .url()
        .refine(
          (value) => /^https?:\/\//i.test(value),
          "Укажите ссылку http или https",
        ),
    )
    .max(MAX_IMAGES)
    .optional(),
});
export type Project = z.infer<typeof projectSchema>;
export const PURCHASE_STATUSES = [
  "planned",
  "in_transit",
  "delivered",
  "cancelled",
] as const;
export const PURCHASE_LABELS = {
  planned: "Запланировано",
  in_transit: "В пути",
  delivered: "Доставлено",
  cancelled: "Отменено",
  unassigned: "Уточнить состояние",
} as const;
export const purchaseSchema = z.object({
  id: identifier,
  orderId: identifier,
  quantity: count.optional(),
  status: z.enum([...PURCHASE_STATUSES, "unassigned"]),
  aliexpress: z
    .object({
      orderId: identifier,
      itemKey: z.string().min(1).max(2000),
      ambiguous: z.boolean().optional(),
      productUrl: optionalUrl,
      sku: optionalText(1000),
      unitsPerPack: count.positive(),
      exportedAt: z.string().datetime(),
      lastQuantity: count.optional(),
      lastStatus: z.enum([...PURCHASE_STATUSES, "unassigned"]),
      quantityOverride: z.boolean().optional(),
      statusOverride: z.boolean().optional(),
    })
    .optional(),
});
export const usageSchema = z.object({
  id: identifier,
  projectId: identifier,
  quantity: count.optional(),
});
export type Purchase = z.infer<typeof purchaseSchema>;
export type Usage = z.infer<typeof usageSchema>;
export const shipmentSchema = z.object({
  id: identifier,
  trackingNumber: z.string().trim().min(1, "Укажите трек-номер").max(200),
  carrier: optionalText(200),
  status: optionalText(200),
  url: optionalUrl,
});
export const logisticsSchema = z.object({
  ignoredAliItems: z
    .array(
      z.object({
        id: identifier,
        orderId: identifier,
        itemKey: z.string().min(1).max(8000),
        title: z.string().max(4000),
        createdAt: z.string().datetime(),
      }),
    )
    .max(10000)
    .optional(),
  orders: z.array(orderSchema).max(5000).default([]),
  shipments: z.array(shipmentSchema).max(5000).default([]),
  projects: z.array(projectSchema).max(5000).optional(),
});
export const INVENTORY_STATUSES = [
  "in_stock",
  "in_transit",
  "used",
  "unassigned",
] as const;
export const inventoryEntrySchema = z.object({
  id: identifier,
  status: z.enum(INVENTORY_STATUSES),
  quantity: count.optional(),
  orderId: identifier.optional(),
  shipmentId: identifier.optional(),
  project: optionalText(200),
});
export const movementSchema = z.object({
  id: identifier,
  createdAt: z.string().datetime(),
  from: z.enum(INVENTORY_STATUSES),
  to: z.enum(INVENTORY_STATUSES),
  quantity: count.positive(),
  orderId: identifier.optional(),
  shipmentId: identifier.optional(),
  project: optionalText(200),
});
export type InventoryEntry = z.infer<typeof inventoryEntrySchema>;
export type Movement = z.infer<typeof movementSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Shipment = z.infer<typeof shipmentSchema>;
export type Logistics = z.infer<typeof logisticsSchema>;

const componentFieldsSchema = z.object({
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
      .safe("Количество слишком большое")
      .min(0, "Количество не может быть отрицательным")
      .optional(),
  ),

  status: z.preprocess(emptyToUndefined, z.enum(COMPONENT_STATUSES).optional()),

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
  inventory: z.array(inventoryEntrySchema).max(1000).optional(),
  comments: z.array(commentSchema).max(500).default([]),
  history: z.array(movementSchema).max(10000).default([]),
  purchases: z.array(purchaseSchema).max(1000).optional(),
  usages: z.array(usageSchema).max(1000).optional(),
});

export const componentDataSchema = componentFieldsSchema
  .transform(({ quantity, status, inventory, ...data }) => ({
    ...data,
    ...(data.purchases === undefined && data.usages !== undefined
      ? { purchases: [] }
      : {}),
    inventory:
      inventory ??
      (data.purchases !== undefined || data.usages !== undefined
        ? []
        : legacyInventory(quantity, status)),
  }))
  .superRefine((data, ctx) => {
    for (const field of [
      "inventory",
      "comments",
      "history",
      "purchases",
      "usages",
    ] as const) {
      const ids = (data[field] ?? []).map((entry) => entry.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Повторяющиеся записи",
        });
    }
    for (const field of ["inventory", "purchases", "usages"] as const) {
      const sum = (data[field] ?? []).reduce(
        (total, entry) => total + (entry.quantity ?? 0),
        0,
      );
      if (!Number.isSafeInteger(sum))
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Суммарное количество слишком большое",
        });
    }
  });

function legacyInventory(
  quantity?: number,
  status?: ComponentStatus,
): InventoryEntry[] {
  if (status === "out_of_stock" && (!quantity || quantity === 0)) return [];
  return [
    {
      id: "legacy",
      status:
        !status || status === "out_of_stock" || status === "planned"
          ? "unassigned"
          : status,
      // В старом каталоге «в пути: 0» часто означало неизвестное количество.
      quantity:
        status === "in_transit" && quantity === 0 ? undefined : quantity,
    },
  ];
}

export const componentSaveSchema = z.preprocess(
  (body) => {
    if (body && typeof body === "object" && "data" in body) return body;
    return { data: body };
  },
  z.object({
    data: componentDataSchema,
    logistics: logisticsSchema.optional(),
  }),
);

export function inventoryTotals(
  data: Pick<ComponentData, "inventory" | "purchases" | "usages">,
) {
  if (data.purchases) {
    const purchases = data.purchases;
    const usages = data.usages ?? [];
    const delivered = purchases.filter((entry) => entry.status === "delivered");
    const used = usages.reduce((sum, entry) => sum + (entry.quantity ?? 0), 0);
    const stockUnknown =
      delivered.some((entry) => entry.quantity === undefined) ||
      usages.some((entry) => entry.quantity === undefined);
    const stock =
      delivered.reduce((sum, entry) => sum + (entry.quantity ?? 0), 0) - used;
    return [
      {
        status: "in_stock" as const,
        quantity: Math.max(0, stock),
        unknown: stockUnknown,
      },
      ...(["in_transit", "planned", "unassigned"] as const).map((status) => {
        const entries = purchases.filter((entry) => entry.status === status);
        return {
          status,
          quantity: entries.reduce(
            (sum, entry) => sum + (entry.quantity ?? 0),
            0,
          ),
          unknown: entries.some((entry) => entry.quantity === undefined),
        };
      }),
      {
        status: "used" as const,
        quantity: used,
        unknown: usages.some((entry) => entry.quantity === undefined),
      },
    ];
  }
  return INVENTORY_STATUSES.map((status) => {
    const entries = data.inventory.filter((entry) => entry.status === status);
    return {
      status,
      quantity: entries.reduce((sum, entry) => sum + (entry.quantity ?? 0), 0),
      unknown: entries.some((entry) => entry.quantity === undefined),
    };
  });
}

export function hasInventoryStatus(
  data: Pick<ComponentData, "inventory" | "purchases" | "usages">,
  status: string,
) {
  const totals = inventoryTotals(data);
  if (status === "out_of_stock") {
    return !totals.some(
      (total) =>
        (total.status === "in_stock" || total.status === "unassigned") &&
        (total.quantity > 0 || total.unknown),
    );
  }
  return totals.some(
    (total) => total.status === status && (total.quantity > 0 || total.unknown),
  );
}

export function moveInventory(
  data: Pick<ComponentData, "inventory" | "history">,
  entryId: string,
  quantity: number,
  project?: string,
): Pick<ComponentData, "inventory" | "history"> {
  const entry = data.inventory.find((value) => value.id === entryId);
  if (
    !entry ||
    entry.quantity === undefined ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    quantity > entry.quantity
  )
    throw new Error("Укажите количество в пределах остатка");
  if (entry.status !== "in_transit" && entry.status !== "in_stock")
    throw new Error("Этот статус нельзя перенести");
  const to = entry.status === "in_transit" ? "in_stock" : "used";
  const destination: InventoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    quantity,
    status: to,
    project: to === "used" ? project?.trim() || undefined : undefined,
  };
  return {
    inventory: [
      ...data.inventory
        .map((value) =>
          value.id === entryId
            ? { ...value, quantity: value.quantity! - quantity }
            : value,
        )
        .filter((value) => value.id !== entryId || value.quantity !== 0),
      destination,
    ],
    history: [
      ...data.history,
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        from: entry.status,
        to,
        quantity,
        orderId: entry.orderId,
        shipmentId: entry.shipmentId,
        project: destination.project,
      },
    ],
  };
}

export type ComponentData = z.infer<typeof componentDataSchema>;

/** Главное изображение компонента — первое в списке. */
export function mainImage(
  data: Pick<ComponentData, "images">,
): string | undefined {
  return data.images?.[0];
}
