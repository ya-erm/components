import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

export class TelegramError extends Error {
  constructor(code) { super(`Telegram API: ошибка ${code}`); this.code = code; }
}

export function assertRecipient(config) {
  if (!config.token || !/^\d+$/.test(config.chatId ?? "") || !/^\d+$/.test(config.adminId ?? "") || config.chatId !== config.adminId) {
    throw new Error("Нужны BOT_TOKEN, TELEGRAM_CHAT_ID и TELEGRAM_ADMIN_ID одного личного чата");
  }
}

export function authorized(message, config) {
  return message?.chat?.type === "private" && !message.from?.is_bot &&
    String(message.chat.id) === config.chatId && String(message.from?.id) === config.adminId;
}

export class Telegram {
  constructor(config) { this.config = config; }

  async request(method, payload = {}, options = {}) {
    if (!this.config.token) throw new Error("Не задан BOT_TOKEN");
    const { body, headers, timeout = 45_000, signal } = options;
    let response;
    try {
      response = await fetch(`${this.config.base}/bot${this.config.token}/${method}`, {
        method: "POST", redirect: "error",
        headers: headers ?? { "Content-Type": "application/json" },
        body: body ?? JSON.stringify(payload),
        ...(body ? { duplex: "half" } : {}),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new TelegramError(result.error_code || response.status);
      return result.result;
    } catch (error) {
      if (error instanceof TelegramError || signal?.aborted) throw error;
      // Ошибки fetch могут содержать URL с токеном. Никогда не отдаём их в лог.
      throw new Error(`Telegram ${method}: сетевая ошибка или таймаут`);
    }
  }

  message(text, { silent = false } = {}) {
    return this.request("sendMessage", { chat_id: this.config.chatId, text, disable_notification: silent });
  }

  async document(path, caption) {
    return this.upload("sendDocument", { chat_id: this.config.chatId, caption }, [{ field: "document", path }]);
  }

  async documents(archives, caption, photoFileId, { silent = false } = {}) {
    const files = [];
    const media = archives.map((archive, index) => {
      const reused = archive.group === "photos" && photoFileId;
      if (!reused) files.push({ field: archive.group, path: archive.path });
      return { type: "document", media: reused || `attach://${archive.group}`,
        ...(index === 0 ? { caption } : {}) };
    });
    return this.upload("sendMediaGroup", { chat_id: this.config.chatId, media: JSON.stringify(media), disable_notification: silent }, files);
  }

  async upload(method, fields, files) {
    const boundary = `components-${randomUUID()}`;
    const head = Buffer.from(Object.entries(fields).map(([key, value]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`).join(""));
    const attachments = [];
    let length = head.length;
    for (const file of files) {
      const size = (await stat(file.path)).size;
      if (size > this.config.maxFileBytes) throw new Error("Архив больше TELEGRAM_MAX_FILE_MB: используйте локальный Bot API");
      const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${basename(file.path)}"\r\nContent-Type: application/gzip\r\n\r\n`);
      attachments.push({ ...file, header });
      length += header.length + size + 2;
    }
    const tail = Buffer.from(`--${boundary}--\r\n`);
    // Потоковая загрузка: даже большой архив не помещается целиком в RAM.
    const body = Readable.from((async function* () {
      yield head;
      for (const file of attachments) { yield file.header; yield* createReadStream(file.path); yield Buffer.from("\r\n"); }
      yield tail;
    })());
    try {
      return await this.request(method, {}, { body,
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": String(length + tail.length) },
        timeout: 30 * 60_000,
      });
    } finally { body.destroy(); }
  }
}
