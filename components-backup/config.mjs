import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config, parse } from "dotenv";
import { readFile, writeFile, chmod } from "node:fs/promises";

export const ROOT = dirname(fileURLToPath(import.meta.url));
// У отдельной копии на сервере есть собственный .env. Корень проекта — fallback
// только для локальной подготовки, без изменения .env приложения.
config({ path: resolve(ROOT, "../.env"), quiet: true });
config({ path: resolve(ROOT, ".env"), override: true, quiet: true });

const SOURCE_KEYS = [
  "BOT_TOKEN", "S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY", "S3_FORCE_PATH_STYLE", "S3_SESSION_TOKEN",
];

export async function initEnv(chatId) {
  if (!/^\d+$/.test(chatId ?? "")) throw new Error("Укажите положительный ID личного чата");
  const source = parse(await readFile(resolve(ROOT, "../.env")));
  const values = Object.fromEntries(SOURCE_KEYS.filter((k) => source[k]).map((k) => [k, source[k]]));
  Object.assign(values, {
    TELEGRAM_CHAT_ID: chatId, TELEGRAM_ADMIN_ID: chatId,
    TELEGRAM_API_BASE: "http://127.0.0.1:8081", TELEGRAM_MAX_FILE_MB: "1900",
    BACKUP_DATA_DIR: "./data", BACKUP_TIME_UTC: "02:00", BACKUP_KEEP: "14",
  });
  // dotenv поддерживает однострочные значения в одинарных кавычках.
  if (Object.values(values).some((v) => /['\r\n]/.test(v))) throw new Error("Неподдерживаемый символ в .env");
  const content = Object.entries(values).map(([k, v]) => `${k}='${v}'`).join("\n") + "\n";
  await writeFile(resolve(ROOT, ".env"), content, { flag: "wx", mode: 0o600 });
  await chmod(resolve(ROOT, ".env"), 0o600);
}

export function settings(env = process.env) {
  const required = (key) => {
    if (!env[key]) throw new Error(`Не задан ${key}`);
    return env[key];
  };
  const positive = (key, fallback) => {
    const n = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Некорректный ${key}`);
    return n;
  };
  const base = (env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, "");
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      !["http:", "https:"].includes(url.protocol)) throw new Error("Некорректный TELEGRAM_API_BASE");
  if (url.protocol === "http:" && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("HTTP Telegram API разрешён только через loopback или SSH-туннель");
  }
  const time = env.BACKUP_TIME_UTC ?? "02:00";
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Некорректный BACKUP_TIME_UTC");
  const maxFileMB = positive("TELEGRAM_MAX_FILE_MB", base === "https://api.telegram.org" ? 49 : 1900);
  if (maxFileMB > (base === "https://api.telegram.org" ? 49 : 1900)) throw new Error("Превышен лимит Telegram API");
  return {
    bucket: required("S3_BUCKET"), dataDir: resolve(ROOT, env.BACKUP_DATA_DIR || "./data"),
    keep: positive("BACKUP_KEEP", 14), time,
    s3: {
      endpoint: env.S3_ENDPOINT || undefined, region: env.S3_REGION || "us-east-1",
      forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
      maxAttempts: 3,
      requestHandler: { connectionTimeout: 15_000, requestTimeout: 120_000 },
      credentials: {
        accessKeyId: required("S3_ACCESS_KEY_ID"), secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
        ...(env.S3_SESSION_TOKEN ? { sessionToken: env.S3_SESSION_TOKEN } : {}),
      },
    },
    telegram: { base, token: env.BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID, adminId: env.TELEGRAM_ADMIN_ID,
      maxFileBytes: maxFileMB * 1_000_000 },
  };
}
