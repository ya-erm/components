import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile, readdir, rename, rm, stat, lstat } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import * as tar from "tar";

const METADATA = ["ContentType", "ContentEncoding", "ContentDisposition", "ContentLanguage", "CacheControl", "Metadata", "WebsiteRedirectLocation"];
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const fingerprintPhotos = (objects) => createHash("sha256").update(json(objects.map(({ file, ...object }) => object))).digest("hex");

export function fingerprintObjects(objects) {
  const entries = objects.map(({ key, etag, size, modified }) => ({ key, etag, size, modified }));
  entries.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  return createHash("sha256").update(json(entries)).digest("hex");
}

export async function listObjects(s3, bucket) {
  const objects = [];
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const item of page.Contents ?? []) {
      if (typeof item.Key !== "string" || !item.ETag || !Number.isSafeInteger(item.Size)) throw new Error("Неполный ответ S3");
      objects.push({ key: item.Key, etag: item.ETag, size: item.Size, modified: item.LastModified?.toISOString() });
    }
    if (page.IsTruncated && (!page.NextContinuationToken || page.NextContinuationToken === token)) throw new Error("Некорректная пагинация S3");
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  objects.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  if (new Set(objects.map((o) => o.key)).size !== objects.length) throw new Error("Дубли ключей S3");
  return objects;
}

async function digestFile(path) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) { hash.update(chunk); size += chunk.length; }
  return { sha256: hash.digest("hex"), size };
}

export async function snapshot(s3, bucket, directory) {
  const before = await listObjects(s3, bucket);
  if (!before.length) throw new Error("Бакет пуст: бекап не создан");
  await mkdir(join(directory, "objects"), { recursive: true, mode: 0o700 });
  const objects = [];
  for (const [index, object] of before.entries()) {
    // Имена ключей S3 могут содержать ../, слеши и Unicode. На диске — только номера.
    const file = `objects/${String(index).padStart(8, "0")}`;
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: object.key, IfMatch: object.etag }));
    if (!response.Body || response.ETag !== object.etag) throw new Error("Объект S3 изменился при чтении");
    const hash = createHash("sha256");
    let size = 0;
    const meter = new Transform({ transform(chunk, _encoding, done) { hash.update(chunk); size += chunk.length; done(null, chunk); } });
    await pipeline(response.Body, meter, createWriteStream(join(directory, file), { flags: "wx", mode: 0o600 }));
    if (size !== object.size) throw new Error("Размер объекта S3 изменился при чтении");
    objects.push({ ...object, file, sha256: hash.digest("hex"), metadata: Object.fromEntries(METADATA.filter((k) => response[k] !== undefined).map((k) => [k, response[k]])) });
  }
  const after = await listObjects(s3, bucket);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Бакет изменился во время бекапа; повторите запуск");
  const manifest = { version: 1, bucket, createdAt: new Date().toISOString(), objects };
  await writeFile(join(directory, "manifest.json"), json(manifest), { flag: "wx", mode: 0o600 });
  return manifest;
}

export async function verifyDirectory(directory) {
  if (!(await lstat(join(directory, "manifest.json"))).isFile()) throw new Error("Некорректный manifest.json");
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.objects) || typeof manifest.bucket !== "string") throw new Error("Неподдерживаемый манифест");
  if (manifest.group && !["data", "photos"].includes(manifest.group)) throw new Error("Некорректная группа архива");
  if (manifest.group && !/^[a-f0-9]{64}$/.test(manifest.photosFingerprint)) throw new Error("Некорректный отпечаток фото");
  if (!(await lstat(join(directory, "objects"))).isDirectory()) throw new Error("Некорректная папка objects");
  const keys = new Set();
  const files = new Set();
  for (const object of manifest.objects) {
    if (typeof object.key !== "string" || !object.key || keys.has(object.key) ||
        !/^objects\/\d{8}$/.test(object.file) || files.has(object.file) ||
        !/^[a-f0-9]{64}$/.test(object.sha256) || !Number.isSafeInteger(object.size) || object.size < 0 ||
        !object.metadata || typeof object.metadata !== "object" || Array.isArray(object.metadata) ||
        Object.keys(object.metadata).some((k) => !METADATA.includes(k))) throw new Error("Некорректный объект в манифесте");
    keys.add(object.key); files.add(object.file);
    if (manifest.group && object.key.startsWith("public/images/") !== (manifest.group === "photos")) throw new Error("Объект не соответствует группе архива");
    const path = join(directory, object.file);
    if (!(await lstat(path)).isFile()) throw new Error("Объект архива не является обычным файлом");
    const actual = await digestFile(path);
    if (actual.size !== object.size || actual.sha256 !== object.sha256) throw new Error("Не совпадают размер или SHA256 объекта");
  }
  if ((await readdir(join(directory, "objects"))).length !== files.size) throw new Error("Лишние объекты в архиве");
  if (manifest.group === "photos" && fingerprintPhotos(manifest.objects) !== manifest.photosFingerprint) throw new Error("Отпечаток фото не совпадает с содержимым");
  return manifest;
}

export async function extractVerified(archive, temporaryRoot) {
  const dir = await mkdtemp(join(temporaryRoot, ".verify-"));
  try {
    let invalid = false;
    const seen = new Set();
    await tar.x({ file: archive, cwd: dir, strict: true, preservePaths: false,
      filter(path, entry) {
        const allowed = (path === "manifest.json" && entry.type === "File") ||
            (path === "objects/" && entry.type === "Directory") ||
            (/^objects\/\d{8}$/.test(path) && entry.type === "File");
        if (!allowed || seen.has(path)) {
          // Исключение внутри callback tar может выйти из Promise как uncaught.
          // Пропускаем запись и отклоняем весь архив после завершения чтения.
          invalid = true;
          return false;
        }
        seen.add(path);
        return true;
      },
    });
    if (invalid) throw new Error("Недопустимый путь или тип записи в архиве");
    return { directory: dir, manifest: await verifyDirectory(dir) };
  } catch (error) { await rm(dir, { recursive: true, force: true }); throw error; }
}

export async function createBackup(s3, config) {
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  const work = await mkdtemp(join(config.dataDir, ".work-"));
  try {
    const source = join(work, "source");
    const manifest = await snapshot(s3, config.bucket, source);
    const photos = manifest.objects.filter((o) => o.key.startsWith("public/images/"));
    // Пути objects/ — технические номера, не часть содержимого S3.
    const photosFingerprint = fingerprintPhotos(photos);
    const archives = [];
    for (const group of ["data", "photos"]) {
      const directory = join(work, group);
      await mkdir(join(directory, "objects"), { recursive: true, mode: 0o700 });
      const objects = manifest.objects.filter((o) => o.key.startsWith("public/images/") === (group === "photos"));
      for (const object of objects) await rename(join(source, object.file), join(directory, object.file));
      await writeFile(join(directory, "manifest.json"), json({ ...manifest, group, photosFingerprint, objects }), { mode: 0o600 });
      const name = `${group}.tar.gz`;
      const archive = join(work, name);
      await tar.c({ file: archive, cwd: directory, gzip: true, portable: true, noMtime: true }, ["manifest.json", "objects"]);
      // Проверяем распакованные байты, а не только исходные скачанные файлы.
      const checked = await extractVerified(archive, work);
      await rm(checked.directory, { recursive: true, force: true });
      archives.push({ group, name, ...await digestFile(archive) });
      await rm(directory, { recursive: true, force: true });
    }
    const name = `components-${manifest.createdAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const result = join(config.dataDir, name);
    await rm(source, { recursive: true, force: true });
    await writeFile(join(work, "SHA256SUMS"), archives.map((a) => `${a.sha256}  ${a.name}\n`).join(""), { mode: 0o600 });
    await writeFile(join(work, "summary.json"), json({ bucket: config.bucket, createdAt: manifest.createdAt, objects: manifest.objects.length, images: photos.length, sourceBytes: manifest.objects.reduce((n, o) => n + o.size, 0), photosFingerprint, archives }), { mode: 0o600 });
    await rename(work, result);
    return { directory: result, manifest, photosFingerprint, archives: archives.map((a) => ({ ...a, path: join(result, a.name) })) };
  } catch (error) { await rm(work, { recursive: true, force: true }); throw error; }
}

export async function restore(s3, directory, targetBucket) {
  // Полная проверка до первой записи. Команда CLI отдельно требует --write.
  const manifest = await verifyDirectory(directory);
  for (const object of manifest.objects) {
    await s3.send(new PutObjectCommand({ ...object.metadata, Bucket: targetBucket, Key: object.key,
      ContentLength: object.size, Body: createReadStream(join(directory, object.file)) }));
  }
  return manifest.objects.length;
}

export async function loadBackup(directory) {
  const checked = [];
  try {
    const archives = [];
    for (const group of ["data", "photos"]) {
      const name = `${group}.tar.gz`;
      const path = join(directory, name);
      const item = await extractVerified(path, directory);
      checked.push(item);
      if (item.manifest.group !== group) throw new Error("Некорректная группа архива");
      archives.push({ group, name, path, ...await digestFile(path) });
    }
    const [data, photos] = checked.map((item) => item.manifest);
    if (data.bucket !== photos.bucket || data.photosFingerprint !== photos.photosFingerprint) throw new Error("Архивы не образуют один комплект");
    return { directory, archives, photosFingerprint: data.photosFingerprint,
      manifest: { ...data, objects: [...data.objects, ...photos.objects] } };
  } finally {
    for (const item of checked) await rm(item.directory, { recursive: true, force: true });
  }
}

export async function prune(dataDir, keep) {
  const completed = [];
  for (const name of await readdir(dataDir)) {
    if (!/^components-[\dTZ:.-]+-[a-f0-9]{8}$/.test(name)) continue;
    const path = join(dataDir, name);
    // Не удаляем неотправленные архивы после ошибки Telegram.
    try { if ((await stat(join(path, "sent.json"))).isFile()) completed.push(name); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  completed.sort().reverse();
  for (const name of completed.slice(keep)) await rm(join(dataDir, name), { recursive: true });
}
