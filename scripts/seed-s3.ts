/**
 * Создаёт/перезаписывает демо-данные в S3:
 *   users/index.json            — пользователь demo / demo12345
 *   users/{id}/catalog.json     — 32 демо-компонента
 *
 * Запуск: pnpm db:seed  (tsx scripts/seed-s3.ts)
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { putJson } from "../lib/s3";
import type { UserRecord } from "../lib/users-repo";

const DEMO_LOGIN = "demo";
const DEMO_PASSWORD = "demo12345";

type Seed = {
  name: string;
  quantity?: number;
  status?: "in_stock" | "in_transit" | "out_of_stock";
  note?: string;
  url?: string;
  type?: string;
  tags?: string[];
};

const COMPONENTS: Seed[] = [
  { name: "Резистор 10 кОм 0.25 Вт", quantity: 480, status: "in_stock", note: "Лента, 1% точность", type: "Резистор", tags: ["smd", "0805"] },
  { name: "Резистор 1 кОм 0.25 Вт", quantity: 350, status: "in_stock", type: "Резистор", tags: ["smd", "0805"] },
  { name: "Конденсатор 100 нФ X7R", quantity: 600, status: "in_stock", note: "Керамика, 0805", type: "Конденсатор", tags: ["smd", "0805"] },
  { name: "Электролит 1000 мкФ 25 В", quantity: 42, status: "in_stock", type: "Конденсатор", tags: ["выводной"] },
  { name: "Светодиод 5 мм красный", quantity: 220, status: "in_stock", type: "Светодиод", tags: ["выводной", "5мм"] },
  { name: "Светодиод 5 мм синий", quantity: 8, status: "out_of_stock", note: "Почти закончились", type: "Светодиод", tags: ["выводной", "5мм"] },
  { name: "Диод 1N4007", quantity: 300, status: "in_stock", type: "Диод", tags: ["выводной"] },
  { name: "Стабилитрон 5.1 В 0.5 Вт", quantity: 90, status: "in_stock", type: "Диод" },
  { name: "Транзистор BC547", quantity: 150, status: "in_stock", type: "Транзистор", tags: ["выводной", "npn"] },
  { name: "Транзистор IRF540N", quantity: 25, status: "in_stock", url: "https://www.chipdip.ru/", type: "Транзистор", tags: ["mosfet"] },
  { name: "Микросхема NE555", quantity: 40, status: "in_stock", note: "Таймер", type: "Микросхема", tags: ["dip"] },
  { name: "Микросхема LM358", quantity: 35, status: "in_stock", type: "Микросхема", tags: ["dip", "оу"] },
  { name: "Стабилизатор AMS1117-3.3", quantity: 60, status: "in_stock", type: "Стабилизатор", tags: ["smd", "3.3в"] },
  { name: "Стабилизатор LM7805", quantity: 28, status: "in_stock", type: "Стабилизатор", tags: ["5в"] },
  { name: "Arduino Nano (клон)", quantity: 5, status: "in_stock", url: "https://aliexpress.com/", type: "Плата/МК", tags: ["arduino", "avr"] },
  { name: "ESP32 DevKit v1", quantity: 0, status: "in_transit", note: "Заказано, едет", type: "Плата/МК", tags: ["esp", "wifi"] },
  { name: "ESP8266 Wemos D1 mini", quantity: 3, status: "in_stock", type: "Плата/МК", tags: ["esp", "wifi"] },
  { name: "Raspberry Pi Pico", quantity: 4, status: "in_stock", type: "Плата/МК", tags: ["rp2040"] },
  { name: "Дисплей OLED 0.96 I2C", quantity: 6, status: "in_stock", type: "Дисплей", tags: ["i2c", "oled"] },
  { name: "Дисплей LCD 1602 + I2C", quantity: 2, status: "in_stock", type: "Дисплей", tags: ["i2c"] },
  { name: "Датчик DHT22", quantity: 7, status: "in_stock", note: "Температура/влажность", type: "Датчик", tags: ["температура", "влажность"] },
  { name: "Датчик BMP280", quantity: 0, status: "out_of_stock", type: "Датчик", tags: ["давление", "i2c"] },
  { name: "Модуль реле 1 канал 5 В", quantity: 12, status: "in_stock", type: "Реле", tags: ["5в", "модуль"] },
  { name: "Драйвер мотора L298N", quantity: 3, status: "in_stock", type: "Модуль", tags: ["двигатель"] },
  { name: "Серво SG90", quantity: 10, status: "in_stock", type: "Двигатель", tags: ["серво"] },
  { name: "Шаговый двигатель 28BYJ-48", quantity: 4, status: "in_stock", type: "Двигатель", tags: ["шаговый"] },
  { name: "Макетная плата 830 точек", quantity: 5, status: "in_stock", type: "Расходники", tags: ["прототип"] },
  { name: "Провода Dupont 40 шт", quantity: 9, status: "in_stock", note: "М-М, М-П, П-П", type: "Кабель/Провод", tags: ["прототип"] },
  { name: "Кнопка тактовая 6x6 мм", quantity: 200, status: "in_stock", type: "Кнопка", tags: ["выводной"] },
  { name: "Гребёнка PLS-40 2.54 мм", quantity: 30, status: "in_stock", type: "Разъём", tags: ["2.54"] },
  { name: "Припой 0.8 мм с флюсом", quantity: 1, status: "in_stock", note: "Катушка 100 г", type: "Расходники", tags: ["пайка"] },
  { name: "Термоусадка набор", quantity: 0, status: "in_transit", type: "Расходники" },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const userId = randomUUID();
  const now = new Date().toISOString();

  const record: UserRecord = { id: userId, login: DEMO_LOGIN, passwordHash, createdAt: now };

  // Перезаписываем индекс (идемпотентно).
  await putJson("users/index.json", {
    byLogin: { [DEMO_LOGIN]: record },
    byId: { [userId]: record },
  });

  const catalog = COMPONENTS.map((c) => ({
    id: randomUUID(),
    data: { images: [] as string[], ...c },
    createdAt: now,
    updatedAt: now,
  }));

  await putJson(`users/${userId}/catalog.json`, catalog);

  console.log(`Готово. Пользователь "${DEMO_LOGIN}" (пароль "${DEMO_PASSWORD}"), компонентов: ${catalog.length}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
