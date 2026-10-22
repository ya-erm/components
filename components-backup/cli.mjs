#!/usr/bin/env node
import { S3Client } from "@aws-sdk/client-s3";
import { mkdir, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { initEnv, settings } from "./config.mjs";
import { createBackup, extractVerified, restore, loadBackup } from "./storage.mjs";
import { Telegram, assertRecipient } from "./telegram.mjs";
import { deliverBackup, lock, runBot } from "./service.mjs";

process.umask(0o077);
const [command, ...args] = process.argv.slice(2);
let s3;
let unlock;

try {
  if (command === "init-env") {
    await initEnv(args[0]);
    console.log("components-backup/.env создан (0600), секреты не выводятся");
  } else if (["verify", "restore"].includes(command)) {
    if (!args[0]) throw new Error("Укажите путь к .tar.gz");
    if (command === "verify" && (args.length > 2 || args.some((v) => v.startsWith("--")))) throw new Error("verify принимает один архив или пару data.tar.gz photos.tar.gz");
    const temporaryRoot = await mkdtemp(join(tmpdir(), "components-restore-"));
    try {
      const checked = [];
      for (const archive of command === "verify" ? args : [args[0]]) {
        const item = await extractVerified(resolve(archive), temporaryRoot);
        checked.push(item);
        console.log(`Проверено: ${item.manifest.objects.length} объектов, группа ${item.manifest.group ?? "all"}`);
      }
      if (checked.length === 2) {
        const [a, b] = checked.map((c) => c.manifest);
        if (new Set([a.group, b.group]).size !== 2 || ![a.group, b.group].every((v) => ["data", "photos"].includes(v)) ||
            a.bucket !== b.bucket || a.photosFingerprint !== b.photosFingerprint) throw new Error("Архивы не образуют один комплект данных и фотографий");
        console.log("Архивы совместимы: набор фотографий совпадает");
      }
      const { directory, manifest } = checked[0];
      if (command === "restore") {
        const targetIndex = args.indexOf("--target-bucket");
        const target = targetIndex < 0 ? undefined : args[targetIndex + 1];
        if (!target || target.startsWith("--") || !args.includes("--write")) throw new Error("Запись требует --target-bucket NAME --write");
        const config = settings();
        if (target === manifest.bucket && !args.includes("--allow-original")) throw new Error("Для исходного бакета дополнительно нужен --allow-original");
        s3 = new S3Client(config.s3);
        console.log(`Восстановлено: ${await restore(s3, directory, target)} объектов`);
      }
    } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
  } else if (["once", "bot", "send", "discover", "use-local-api"].includes(command)) {
    const config = settings();
    if (process.env.TELEGRAM_API_BASE_OVERRIDE) {
      config.telegram = settings({ ...process.env, TELEGRAM_API_BASE: process.env.TELEGRAM_API_BASE_OVERRIDE }).telegram;
    }
    const telegram = new Telegram(config.telegram);
    if (command === "discover") {
      const me = await telegram.request("getMe");
      const updates = await telegram.request("getUpdates", { timeout: 0 });
      console.log(JSON.stringify({ bot: me.username, starts: updates.filter((u) => u.message?.chat.type === "private" && u.message?.text === "/start").map((u) => ({ chatId: u.message.chat.id, userId: u.message.from.id, username: u.message.from.username })) }, null, 2));
    } else if (command === "use-local-api") {
      if (config.telegram.base === "https://api.telegram.org") throw new Error("Укажите локальный TELEGRAM_API_BASE");
      const cloud = new Telegram({ ...config.telegram, base: "https://api.telegram.org" });
      await cloud.request("logOut");
      console.log(`Локальный API готов: @${(await telegram.request("getMe")).username}`);
    } else {
      if (command === "bot" || command === "send" || args.includes("--send")) assertRecipient(config.telegram);
      if (command === "send" && !args[0]) throw new Error("Укажите папку готового комплекта");
      await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
      unlock = await lock(config.dataDir);
      s3 = new S3Client(config.s3);
      if (command === "once" || command === "send") {
        const backup = command === "send" ? await loadBackup(resolve(args[0])) : await createBackup(s3, config);
        console.log(`Готово: ${backup.directory}`);
        for (const archive of backup.archives) console.log(`${archive.name}: ${archive.size} байт`);
        if (command === "send" || args.includes("--send")) { await deliverBackup(backup, config, telegram); console.log("Альбом с обоими архивами отправлен"); }
      } else {
        const controller = new AbortController();
        for (const name of ["SIGINT", "SIGTERM"]) process.once(name, () => controller.abort());
        await runBot(s3, config, telegram, controller.signal);
      }
    }
  } else {
    console.log("Команды: init-env CHAT_ID | discover | once [--send] | send BACKUP_DIRECTORY | bot | use-local-api | verify ARCHIVE [PHOTOS_ARCHIVE] | restore ARCHIVE --target-bucket NAME --write [--allow-original]");
    if (command) process.exitCode = 1;
  }
} catch (error) {
  // Не печатаем stack/cause SDK, где могут оказаться URL/credentials.
  let message = error.message || "Неизвестная ошибка";
  for (const [key, value] of Object.entries(process.env)) if (/TOKEN|SECRET|ACCESS_KEY/.test(key) && value) message = message.replaceAll(value, "[скрыто]");
  console.error(message);
  process.exitCode = 1;
} finally { s3?.destroy(); if (unlock) await unlock(); }
