import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import lockfile from "proper-lockfile";
import { createBackup, prune, listObjects, fingerprintObjects } from "./storage.mjs";
import { authorized, assertRecipient, TelegramError } from "./telegram.mjs";

export async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

export async function writeJson(path, value) {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path);
}

const deliveryScope = (config) => createHash("sha256").update(JSON.stringify([
  config.bucket, config.telegram.token, config.telegram.base, config.telegram.chatId,
])).digest("hex");

export async function rememberSuccessfulDelivery(backup, config, sentAt = new Date().toISOString()) {
  await writeJson(join(config.dataDir, "last-success.json"), {
    scope: deliveryScope(config), fingerprint: fingerprintObjects(backup.manifest.objects), sentAt,
  });
}

export function scheduledBackupNeeded(objects, lastSuccess, config, now = new Date()) {
  const elapsed = now.getTime() - Date.parse(lastSuccess?.sentAt);
  return lastSuccess?.scope !== deliveryScope(config) ||
    lastSuccess?.fingerprint !== fingerprintObjects(objects) ||
    !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 7 * 24 * 60 * 60_000;
}

export async function lock(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "lock");
  let release;
  try {
    // Heartbeat позволяет восстановить lock после SIGKILL или перезагрузки.
    release = await lockfile.lock(directory, { lockfilePath: path, stale: 60_000, update: 10_000, retries: 0 });
  }
  catch (error) {
    if (error.code === "ELOCKED") throw new Error("Бекапилка уже работает. После аварийной остановки блокировка устаревает через минуту");
    throw error;
  }
  try { await writeFile(join(directory, "lock-pid"), `${process.pid}\n`, { mode: 0o600 }); }
  catch (error) { await release(); throw error; }
  return async () => { await rm(join(directory, "lock-pid"), { force: true }); await release(); };
}

export async function deliverBackup(backup, config, telegram, { silent = false } = {}) {
  assertRecipient(config.telegram);
  const cachePath = join(config.dataDir, "telegram-photos.json");
  // file_id привязан к конкретному боту и месту его API; не переиспользуем после смены.
  const account = createHash("sha256").update(`${config.telegram.token}:${config.telegram.base}`).digest("hex");
  const cached = await readJson(cachePath, null);
  const photoFileId = cached?.account === account && cached?.fingerprint === backup.photosFingerprint ? cached?.fileId : undefined;
  const caption = `Бекап: ${backup.manifest.createdAt}\nОбъектов: ${backup.manifest.objects.length}, фотографий: ${backup.manifest.objects.filter((o) => o.key.startsWith("public/images/")).length}`;
  let result;
  try { result = await telegram.documents(backup.archives, caption, photoFileId, { silent }); }
  catch (error) {
    if (!photoFileId || !(error instanceof TelegramError) || error.code !== 400) throw error;
    result = await telegram.documents(backup.archives, caption, undefined, { silent });
  }
  if (!Array.isArray(result) || result.length !== 2 || result.some((item) => !item.document?.file_id) ||
      !result[0].media_group_id || result[0].media_group_id !== result[1].media_group_id) throw new Error("Telegram не вернул полный альбом архивов");
  const sent = result.map((item, index) => ({ group: backup.archives[index].group,
    messageId: item.message_id, fileId: item.document.file_id, mediaGroupId: item.media_group_id }));
  const photo = sent.find((item) => item.group === "photos");
  await writeJson(cachePath, { account, fingerprint: backup.photosFingerprint, fileId: photo.fileId });
  await writeJson(join(backup.directory, "sent.json"), { sentAt: new Date().toISOString(), documents: sent });
  await rememberSuccessfulDelivery(backup, config);
  await prune(config.dataDir, config.keep);
}

export function scheduleDue(now, time, lastAttempt) {
  if (!time) return false;
  const date = now.toISOString().slice(0, 10);
  return date !== lastAttempt && now.toISOString().slice(11, 16) >= time;
}

export async function runBot(s3, config, telegram, signal, log = console.log) {
  assertRecipient(config.telegram);
  const info = await telegram.request("getMe");
  const webhook = await telegram.request("getWebhookInfo");
  if (webhook.url) throw new Error("У бота настроен webhook: отключите его перед запуском long polling");
  await telegram.request("setMyCommands", {
    scope: { type: "chat", chat_id: config.telegram.chatId },
    commands: [{ command: "backup", description: "Полный бекап: данные и фотографии" }],
  });
  const statePath = join(config.dataDir, "bot-state.json");
  const state = await readJson(statePath, {});
  if (state.base !== config.telegram.base) { state.base = config.telegram.base; delete state.offset; }
  let job;
  const launch = (scheduled) => {
    job = (async () => {
      try {
        if (scheduled) {
          const lastSuccess = await readJson(join(config.dataDir, "last-success.json"), null);
          const objects = await listObjects(s3, config.bucket);
          if (!scheduledBackupNeeded(objects, lastSuccess, config)) {
            log("Бакет без изменений; до еженедельного бекапа отправка пропущена");
            return;
          }
        }
        const backup = await createBackup(s3, config);
        await deliverBackup(backup, config, telegram, { silent: scheduled });
        log(`Бекап отправлен: ${backup.manifest.objects.length} объектов, ${backup.archives.reduce((n, a) => n + a.size, 0)} байт`);
      } catch (error) {
        log(`Ошибка бекапа: ${error.message}`);
        try { await telegram.message(`Бекап не завершён: ${error.message}`, { silent: scheduled }); }
        catch { log("Не удалось доставить уведомление об ошибке"); }
      } finally { job = undefined; }
    })();
    if (scheduled) log("Начата ежедневная проверка бекапа");
  };
  try {
    log(`Бот @${info.username} готов; расписание UTC: ${config.time || "выключено"}`);
    while (!signal.aborted) {
      // Планировщик не зависит от наличия новых сообщений. Пропущенный запуск
      // выполняется после старта; при ошибке следующая попытка — /backup или завтра.
      if (!job && scheduleDue(new Date(), config.time, state.dailyAttempt)) {
        state.dailyAttempt = new Date().toISOString().slice(0, 10);
        await writeJson(statePath, state);
        launch(true);
      }
      let updates;
      try {
        updates = await telegram.request("getUpdates", { timeout: 30, offset: state.offset, allowed_updates: ["message"] }, { signal });
      } catch (error) {
        if (signal.aborted) break;
        // 409 означает другой poller: не соревнуемся с ним бесконечно.
        if (error instanceof TelegramError && [401, 409].includes(error.code)) throw error;
        log(`Опрос Telegram: ${error.message}`);
        await delay(5_000, undefined, { signal }).catch(() => {});
        continue;
      }
      for (const update of updates) {
        const message = update.message;
        if (authorized(message, config.telegram)) {
          const command = message.text?.trim().split(/\s+/)[0];
          if (command === "/backup" || command?.toLowerCase() === `/backup@${info.username.toLowerCase()}`) {
            if (job) await telegram.message("Бекап уже выполняется.");
            else launch(false);
          } else if (command === "/start") await telegram.message("Команда /backup пришлёт архив данных и архив фотографий.");
        }
        state.offset = update.update_id + 1;
        await writeJson(statePath, state);
      }
    }
  } finally { if (job) { log("Ожидание текущего бекапа перед остановкой"); await job; } }
}
