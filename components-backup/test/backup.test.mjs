import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import * as tar from "tar";
import { createBackup, extractVerified, listObjects, prune, restore, snapshot, verifyDirectory, loadBackup } from "../storage.mjs";
import { authorized, Telegram, TelegramError } from "../telegram.mjs";
import { deliverBackup, lock, scheduleDue, runBot, rememberSuccessfulDelivery, scheduledBackupNeeded } from "../service.mjs";
import { createServer } from "node:http";
import { settings } from "../config.mjs";

function memoryS3(initial, pageSize = 1000) {
  const objects = new Map(Object.entries(initial).map(([key, value]) => [key, { body: Buffer.from(value), metadata: { ContentType: key.endsWith(".json") ? "application/json" : "image/png", CacheControl: "max-age=3600", Metadata: { original: "yes" } } }]));
  return { objects, calls: [], async send(command) {
    this.calls.push(command);
    const input = command.input;
    if (command instanceof ListObjectsV2Command) {
      const all = [...objects].sort(([a], [b]) => a.localeCompare(b)).map(([Key, o]) => ({ Key, ETag: `"${createHash("md5").update(o.body).digest("hex")}"`, Size: o.body.length, LastModified: new Date("2026-01-01T00:00:00Z") }));
      const offset = Number(input.ContinuationToken ?? 0);
      return { Contents: all.slice(offset, offset + pageSize), IsTruncated: offset + pageSize < all.length, NextContinuationToken: String(offset + pageSize) };
    }
    if (command instanceof GetObjectCommand) {
      const o = objects.get(input.Key);
      const etag = `"${createHash("md5").update(o.body).digest("hex")}"`;
      assert.equal(input.IfMatch, etag);
      return { Body: Readable.from(o.body), ETag: etag, ...o.metadata };
    }
    if (command instanceof PutObjectCommand) {
      const chunks = [];
      for await (const chunk of input.Body) chunks.push(chunk);
      objects.set(input.Key, { body: Buffer.concat(chunks), metadata: Object.fromEntries(["ContentType", "CacheControl", "Metadata"].map((k) => [k, input[k]])) });
      return {};
    }
    throw new Error("Unexpected command");
  } };
}

async function temporary(t) {
  const path = await mkdtemp(join(tmpdir(), "components-backup-test-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

function albumMessages() {
  return ["data-file", "photo-file"].map((file_id, index) => ({ message_id: index + 1, media_group_id: "test-group", document: { file_id } }));
}

test("оба архива восстанавливают все байты, ключи и метаданные, включая опасные имена S3", async (t) => {
  const dataDir = await temporary(t);
  const initial = { "users/index.json": "{\"users\":1}", "users/u/catalog.json": "{\"a\":2}", "public/images/u/фото.png": Buffer.from([0, 1, 128, 255]), "../escape": "private", "folder/": "" };
  const source = memoryS3(initial, 2);
  const backup = await createBackup(source, { bucket: "source", dataDir });
  const target = memoryS3({});
  for (const archive of backup.archives) {
    const checked = await extractVerified(archive.path, dataDir);
    assert.equal(checked.manifest.group, archive.group);
    assert.equal(checked.manifest.photosFingerprint, backup.photosFingerprint);
    await restore(target, checked.directory, "target");
  }
  assert.equal(target.objects.size, source.objects.size);
  for (const [key, value] of source.objects) {
    assert.deepEqual(target.objects.get(key), value);
  }
  assert.equal(source.calls.filter((c) => c instanceof PutObjectCommand).length, 0);
  assert.ok(source.calls.filter((c) => c instanceof ListObjectsV2Command).length > 2);
});

test("повторный список замечает изменение бакета и не оставляет готового архива", async (t) => {
  const dataDir = await temporary(t);
  const s3 = memoryS3({ "users/index.json": "original" });
  const send = s3.send.bind(s3);
  s3.send = async (command) => {
    const result = await send(command);
    if (command instanceof GetObjectCommand) s3.objects.set("new.json", { body: Buffer.from("new"), metadata: {} });
    return result;
  };
  await assert.rejects(createBackup(s3, { bucket: "source", dataDir }), /Бакет изменился/);
  assert.deepEqual(await readdir(dataDir), []);
});

test("повторная отправка читает полный готовый комплект и отвергает несовместимые фото", async (t) => {
  const dataDir = await temporary(t);
  const config = { bucket: "source", dataDir };
  const source = memoryS3({ "users/index.json": "{}", "public/images/a": "photo" });
  const first = await createBackup(source, config);
  const loaded = await loadBackup(first.directory);
  assert.equal(loaded.manifest.objects.length, 2);
  assert.equal(loaded.photosFingerprint, first.photosFingerprint);
  source.objects.get("public/images/a").body = Buffer.from("new photo");
  const second = await createBackup(source, config);
  await writeFile(join(first.directory, "photos.tar.gz"), await readFile(join(second.directory, "photos.tar.gz")));
  await assert.rejects(loadBackup(first.directory), /не образуют/);
  assert.equal((await readdir(first.directory)).some((name) => name.startsWith(".verify-")), false);
});

test("неполная пагинация и пустой бакет завершаются ошибкой", async (t) => {
  await assert.rejects(listObjects({ send: async () => ({ IsTruncated: true }) }, "bucket"), /пагинация/);
  await assert.rejects(snapshot(memoryS3({}), "bucket", await temporary(t)), /пуст/);
});

test("повреждение файла запрещает восстановление до первой записи", async (t) => {
  const path = await temporary(t);
  await snapshot(memoryS3({ a: "good", b: "original" }), "bucket", path);
  await writeFile(join(path, "objects/00000001"), "bad");
  const target = memoryS3({});
  await assert.rejects(restore(target, path, "target"), /SHA256/);
  assert.equal(target.objects.size, 0);
});

test("проверка отбрасывает traversal в манифесте и симлинки", async (t) => {
  const path = await temporary(t);
  await snapshot(memoryS3({ a: "good" }), "bucket", path);
  const manifest = JSON.parse(await readFile(join(path, "manifest.json")));
  manifest.objects[0].file = "../escape";
  await writeFile(join(path, "manifest.json"), JSON.stringify(manifest));
  await assert.rejects(verifyDirectory(path), /Некорректный объект/);
  manifest.objects[0].file = "objects/00000000";
  await writeFile(join(path, "manifest.json"), JSON.stringify(manifest));
  await rm(join(path, "objects/00000000"));
  await symlink("../manifest.json", join(path, "objects/00000000"));
  await assert.rejects(verifyDirectory(path), /обычным файлом/);
});

test("распаковка отклоняет неожиданные файлы и ссылки", async (t) => {
  const path = await temporary(t);
  await writeFile(join(path, "extra"), "unexpected");
  await tar.c({ cwd: path, file: join(path, "bad.tar.gz"), gzip: true }, ["extra"]);
  await assert.rejects(extractVerified(join(path, "bad.tar.gz"), path), /Недопустимый/);
  assert.deepEqual((await readdir(path)).filter((f) => f.startsWith(".verify-")), []);
});

test("пустой архив фото допустим, когда фотографий ещё нет", async (t) => {
  const dataDir = await temporary(t);
  const backup = await createBackup(memoryS3({ "users/index.json": "{}" }), { dataDir, bucket: "bucket" });
  const photo = backup.archives.find((a) => a.group === "photos");
  assert.equal((await extractVerified(photo.path, dataDir)).manifest.objects.length, 0);
});

test("архив фото переиспользуется только для того же содержимого и бота", async (t) => {
  const dataDir = await temporary(t);
  const s3 = memoryS3({ "users/index.json": "{}", "public/images/a": "image" });
  const config = { dataDir, bucket: "bucket", keep: 14, telegram: { token: "fake-token", base: "http://127.0.0.1:8081", chatId: "123", adminId: "123" } };
  const calls = [];
  const telegram = { async documents(_archives, _caption, photoFileId) { calls.push(photoFileId); return albumMessages(); } };
  await deliverBackup(await createBackup(s3, config), config, telegram);
  s3.objects.get("users/index.json").body = Buffer.from("{\"new\":true}");
  await deliverBackup(await createBackup(s3, config), config, telegram);
  assert.deepEqual(calls, [undefined, "photo-file"]);
  s3.objects.get("public/images/a").body = Buffer.from("different image");
  await deliverBackup(await createBackup(s3, config), config, telegram);
  assert.equal(calls.at(-1), undefined);
  config.telegram.token = "other-bot";
  await deliverBackup(await createBackup(s3, config), config, telegram);
  assert.equal(calls.at(-1), undefined);
});

test("ошибка альбома не помечает комплект отправленным", async (t) => {
  const dataDir = await temporary(t);
  const config = { dataDir, bucket: "bucket", keep: 1, telegram: { token: "fake", base: "local", chatId: "123", adminId: "123" } };
  const backup = await createBackup(memoryS3({ a: "data", "public/images/a": "photo" }), config);
  await assert.rejects(deliverBackup(backup, config, { async documents() { throw new TelegramError(500); } }), /500/);
  await assert.rejects(deliverBackup(backup, config, { async documents() { return albumMessages().slice(0, 1); } }), /полный альбом/);
  assert.equal((await readdir(backup.directory)).includes("sent.json"), false);
  assert.equal((await readdir(dataDir)).includes("last-success.json"), false);
});

test("без изменений отправка нужна через семь суток, а изменения и смена получателя требуют её раньше", async (t) => {
  const dataDir = await temporary(t);
  const config = { dataDir, bucket: "bucket", telegram: { token: "fake", base: "local", chatId: "123" } };
  const objects = [
    { key: "users/index.json", etag: "data-v1", size: 10, modified: "2026-01-01" },
    { key: "public/images/a", etag: "photo-v1", size: 20, modified: "2026-01-01" },
  ];
  await rememberSuccessfulDelivery({ manifest: { objects } }, config, "2026-10-01T02:00:00Z");
  const last = JSON.parse(await readFile(join(dataDir, "last-success.json")));
  const beforeWeek = new Date("2026-10-08T01:59:59Z");
  assert.equal(scheduledBackupNeeded(objects, last, config, beforeWeek), false);
  assert.equal(scheduledBackupNeeded([...objects].reverse(), last, config, beforeWeek), false);
  assert.equal(scheduledBackupNeeded(objects, last, config, new Date("2026-10-08T02:00:00Z")), true);
  for (const index of [0, 1]) {
    const changed = objects.map((o, i) => i === index ? { ...o, etag: "changed" } : o);
    assert.equal(scheduledBackupNeeded(changed, last, config, beforeWeek), true);
  }
  assert.equal(scheduledBackupNeeded(objects.slice(0, 1), last, config, beforeWeek), true);
  assert.equal(scheduledBackupNeeded([...objects, { key: "new", etag: "new", size: 1 }], last, config, beforeWeek), true);
  assert.equal(scheduledBackupNeeded(objects, last, { ...config, telegram: { ...config.telegram, chatId: "456" } }, beforeWeek), true);
  assert.equal(scheduledBackupNeeded(objects, null, config, beforeWeek), true);
  assert.equal(scheduledBackupNeeded(objects, { ...last, sentAt: "invalid" }, config, beforeWeek), true);
});

test("истёкший file_id повторно загружает полный альбом", async (t) => {
  const dataDir = await temporary(t);
  const config = { dataDir, bucket: "bucket", keep: 14, telegram: { token: "fake", base: "local", chatId: "123", adminId: "123" } };
  const s3 = memoryS3({ a: "data", "public/images/a": "photo" });
  await deliverBackup(await createBackup(s3, config), config, { async documents() { return albumMessages(); } });
  const calls = [];
  await deliverBackup(await createBackup(s3, config), config, { async documents(_archives, _caption, fileId) {
    calls.push(fileId);
    if (fileId) throw new TelegramError(400);
    return albumMessages();
  } });
  assert.deepEqual(calls, ["photo-file", undefined]);
});

test("retention удаляет только лишние завершённые комплекты", async (t) => {
  const dataDir = await temporary(t);
  const names = ["components-2026-01-01T00-00-00-000Z-aaaaaaaa", "components-2026-01-02T00-00-00-000Z-bbbbbbbb", "components-2026-01-03T00-00-00-000Z-cccccccc"];
  for (const name of names) await mkdir(join(dataDir, name));
  for (const name of names.slice(0, 2)) await writeFile(join(dataDir, name, "sent.json"), "{}");
  await mkdir(join(dataDir, "unrelated"));
  await prune(dataDir, 1);
  assert.deepEqual((await readdir(dataDir)).sort(), [...names.slice(1), "unrelated"].sort());
});

test("/backup требует и private chat.id, и from.id, не разрешает группы", () => {
  const config = { chatId: "123", adminId: "123" };
  assert.equal(authorized({ chat: { id: 123, type: "private" }, from: { id: 123 } }, config), true);
  assert.equal(authorized({ chat: { id: 123, type: "private" }, from: { id: 456 } }, config), false);
  assert.equal(authorized({ chat: { id: 456, type: "private" }, from: { id: 123 } }, config), false);
  assert.equal(authorized({ chat: { id: 123, type: "group" }, from: { id: 123 } }, config), false);
});

test("планировщик учитывает UTC, отключение и уже выполненную попытку", () => {
  assert.equal(scheduleDue(new Date("2026-10-22T01:59:00Z"), "02:00"), false);
  assert.equal(scheduleDue(new Date("2026-10-22T02:00:00Z"), "02:00"), true);
  assert.equal(scheduleDue(new Date("2026-10-22T14:00:00Z"), "02:00", "2026-10-22"), false);
  assert.equal(scheduleDue(new Date("2026-10-23T02:01:00Z"), "02:00", "2026-10-22"), true);
  assert.equal(scheduleDue(new Date(), ""), false);
});

test("блокировка не позволяет запустить второй процесс", async (t) => {
  const dir = await temporary(t);
  const unlock = await lock(dir);
  await assert.rejects(lock(dir), /уже работает/);
  await unlock();
  await (await lock(dir))();
});

test("блокировка автоматически восстанавливается после аварийной остановки", async (t) => {
  const dir = await temporary(t);
  await mkdir(join(dir, "lock"));
  const old = new Date(Date.now() - 120_000);
  await utimes(join(dir, "lock"), old, old);
  await (await lock(dir))();
  assert.equal((await readdir(dir)).includes("lock"), false);
});

test("multipart загружает исходные бинарные байты и передаёт file_id", async (t) => {
  const path = join(await temporary(t), "photos.tar.gz");
  const bytes = Buffer.from([0, 1, 2, 255, 128, 0]);
  await writeFile(path, bytes);
  let received;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = Buffer.concat(chunks);
    assert.equal(Number(req.headers["content-length"]), received.length);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, result: { message_id: 1, document: { file_id: "uploaded" } } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const client = new Telegram({ base: `http://127.0.0.1:${server.address().port}`, token: "test", chatId: "123", maxFileBytes: 100 });
  assert.equal((await client.document(path, "Фото")).document.file_id, "uploaded");
  assert.ok(received.includes(bytes));
  assert.ok(received.includes(Buffer.from("name=\"chat_id\"\r\n\r\n123")));
  client.config.maxFileBytes = 1;
  await assert.rejects(client.document(path, ""), /больше/);
});

test("настройки не отправляют секрет по незашифрованному внешнему HTTP", () => {
  const env = { S3_BUCKET: "bucket", S3_ACCESS_KEY_ID: "a", S3_SECRET_ACCESS_KEY: "b", TELEGRAM_API_BASE: "http://example.com" };
  assert.throws(() => settings(env), /loopback/);
  assert.throws(() => settings({ ...env, TELEGRAM_API_BASE: "https://api.telegram.org", TELEGRAM_MAX_FILE_MB: "1900" }), /лимит/);
});

test("два архива отправляются одним mediaGroup, повторные фото передаются как file_id", async (t) => {
  const dir = await temporary(t);
  const archives = ["data", "photos"].map((group) => ({ group, path: join(dir, `${group}.tar.gz`) }));
  const data = Buffer.from("unique-data-bytes");
  const photos = Buffer.from("unique-photos-bytes");
  await writeFile(archives[0].path, data);
  await writeFile(archives[1].path, photos);
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    assert.equal(Number(req.headers["content-length"]), body.length);
    requests.push({ path: req.url, body });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, result: albumMessages() }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const client = new Telegram({ base: `http://127.0.0.1:${server.address().port}`, token: "test", chatId: "123", maxFileBytes: 100 });
  await client.documents(archives, "Общая подпись");
  await client.documents(archives, "Общая подпись", "cached-photo-file", { silent: true });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.path, "/bottest/sendMediaGroup");
    assert.ok(request.body.includes(data));
    assert.ok(request.body.includes(Buffer.from('"media":"attach://data"')));
    assert.equal(request.body.toString().split("Общая подпись").length - 1, 1);
  }
  assert.ok(requests[0].body.includes(photos));
  assert.ok(requests[0].body.includes(Buffer.from('"media":"attach://photos"')));
  assert.equal(requests[1].body.includes(photos), false);
  assert.ok(requests[1].body.includes(Buffer.from('"media":"cached-photo-file"')));
  assert.ok(requests[0].body.includes(Buffer.from('name="disable_notification"\r\n\r\nfalse')));
  assert.ok(requests[1].body.includes(Buffer.from('name="disable_notification"\r\n\r\ntrue')));
});

test("bot обрабатывает /backup, игнорирует постороннего, сохраняет offset и завершает загрузку", async (t) => {
  const dataDir = await temporary(t);
  const config = { dataDir, bucket: "source", keep: 14, time: "", telegram: { token: "fake", base: "local", chatId: "123", adminId: "123" } };
  const controller = new AbortController();
  const sent = [];
  let polls = 0;
  const telegram = {
    async request(method) {
      if (method === "getMe") return { username: "TestBot" };
      if (method === "getWebhookInfo") return {};
      if (method === "setMyCommands") return true;
      if (method === "getUpdates") {
        if (polls++ === 0) return [
          { update_id: 1, message: { chat: { id: 456, type: "private" }, from: { id: 456 }, text: "/backup" } },
          { update_id: 2, message: { chat: { id: 123, type: "private" }, from: { id: 123 }, text: "/backup@TestBot" } },
        ];
        // Позволяем фоновой задаче работать, затем штатно останавливаем poller.
        while (sent.length < 2) await new Promise((resolve) => setTimeout(resolve, 5));
        controller.abort();
        throw new Error("aborted");
      }
    },
    async documents(archives, _caption, _fileId, options) { assert.equal(options.silent, false); sent.push(...archives.map((a) => a.path)); return albumMessages(); },
    async message() { throw new Error("Не должно быть сообщений при успехе"); },
  };
  await runBot(memoryS3({ "users/index.json": "{}", "public/images/a": "png" }), config, telegram, controller.signal, () => {});
  assert.equal(sent.length, 2);
  assert.equal(JSON.parse(await readFile(join(dataDir, "bot-state.json"))).offset, 3);
});

test("ежедневный запуск отправляет альбом без звука", { timeout: 5000 }, async (t) => {
  const dataDir = await temporary(t);
  const config = { dataDir, bucket: "source", keep: 14, time: "00:00", telegram: { token: "fake", base: "local", chatId: "123", adminId: "123" } };
  const controller = new AbortController();
  let options;
  const telegram = {
    async request(method) {
      if (method === "getMe") return { username: "TestBot" };
      if (method === "getWebhookInfo") return {};
      if (method === "setMyCommands") return true;
      if (method === "getUpdates") {
        while (!options) await new Promise((resolve) => setTimeout(resolve, 5));
        controller.abort();
        throw new Error("aborted");
      }
    },
    async documents(_archives, _caption, _fileId, value) { options = value; return albumMessages(); },
    async message() { throw new Error("Ошибка не ожидалась"); },
  };
  await runBot(memoryS3({ a: "data", "public/images/a": "photo" }), config, telegram, controller.signal, () => {});
  assert.equal(options.silent, true);
});

test("ежедневная проверка без изменений не скачивает объекты и не отправляет сообщения", { timeout: 5000 }, async (t) => {
  const dataDir = await temporary(t);
  const config = { dataDir, bucket: "source", keep: 14, time: "00:00", telegram: { token: "fake", base: "local", chatId: "123", adminId: "123" } };
  const source = memoryS3({ a: "data", "public/images/a": "photo" });
  const backup = await createBackup(source, config);
  await rememberSuccessfulDelivery(backup, config);
  source.calls.length = 0;
  const controller = new AbortController();
  let skipped = false;
  const telegram = {
    async request(method) {
      if (method === "getMe") return { username: "TestBot" };
      if (method === "getWebhookInfo") return {};
      if (method === "setMyCommands") return true;
      if (method === "getUpdates") {
        while (!controller.signal.aborted) await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("aborted");
      }
    },
    async documents() { assert.fail("Не должно быть отправки альбома"); },
    async message() { assert.fail("Не должно быть отправки сообщения"); },
  };
  await runBot(source, config, telegram, controller.signal, (line) => {
    if (line.includes("без изменений")) { skipped = true; controller.abort(); }
  });
  assert.equal(skipped, true);
  assert.equal(source.calls.filter((c) => c instanceof GetObjectCommand).length, 0);
  assert.ok(source.calls.some((c) => c instanceof ListObjectsV2Command));
});
